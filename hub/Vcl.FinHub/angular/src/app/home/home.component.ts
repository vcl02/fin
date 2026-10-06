// Consulta por ciclo do snapshot local: mantém a visualização próxima do Fin sem alterar dados ou regras legadas.
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { LegacyFinCycle, LegacyFinSnapshotService } from './legacy-fin-snapshot.service';

@Component({
  selector: 'app-home',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  private readonly snapshots = inject(LegacyFinSnapshotService);
  private readonly changeDetector = inject(ChangeDetectorRef);

  cycle: LegacyFinCycle | null = null;
  selectedCycle = this.currentDate();
  loading = true;
  error = '';

  async ngOnInit(): Promise<void> {
    await this.load(this.selectedCycle);
  }

  async selectCycle(cycle: string): Promise<void> {
    await this.load(cycle);
  }

  async moveCycle(direction: -1 | 1): Promise<void> {
    const cycles = this.cycle?.availableCycles ?? [];
    const next = cycles[cycles.indexOf(this.selectedCycle) + direction];
    if (next) await this.load(next);
  }

  async showCurrentCycle(): Promise<void> {
    await this.load(this.currentDate());
  }

  hasPreviousCycle(): boolean {
    return (this.cycle?.availableCycles.indexOf(this.selectedCycle) ?? -1) > 0;
  }

  hasNextCycle(): boolean {
    const cycles = this.cycle?.availableCycles ?? [];
    return (cycles.indexOf(this.selectedCycle) ?? -1) < cycles.length - 1;
  }

  cycleLabel(cycle: string): string {
    const [year, value] = cycle.slice(0, 10).split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
      .format(new Date(year, value - 1, 1));
  }

  formatDate(value: string | null): string {
    if (!value) return '—';
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  formatMoney(value: number | null): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);
  }

  formatImportedAt(value: string | null): string {
    if (!value) return 'Sem importação';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  private async load(month: string): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      // A data local vem do navegador para o retrato Hoje não herdar fuso horário do servidor.
      this.cycle = await this.snapshots.getCycle(month, this.currentDate());
      this.selectedCycle = this.cycle.cycleStart;
    } catch (error) {
      // A tela não deve congelar se a API local, CORS ou o certificado de desenvolvimento falharem.
      console.error('Falha ao consultar o ciclo local.', error);
      this.error = 'Não foi possível consultar o snapshot local.';
    } finally {
      this.loading = false;
      this.changeDetector.detectChanges();
    }
  }

  private currentDate(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
}
