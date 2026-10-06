// Consulta mensal do snapshot local: mantém a visualização próxima do Fin sem alterar dados ou regras legadas.
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { LegacyFinCycle, LegacyFinSnapshotService } from './legacy-fin-snapshot.service';

@Component({
  selector: 'app-home',
  imports: [CommonModule, FormsModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  private readonly snapshots = inject(LegacyFinSnapshotService);
  private readonly changeDetector = inject(ChangeDetectorRef);

  cycle: LegacyFinCycle | null = null;
  selectedMonth = this.currentMonth();
  loading = true;
  error = '';

  async ngOnInit(): Promise<void> {
    await this.load(this.selectedMonth);
  }

  async selectMonth(month: string): Promise<void> {
    await this.load(month);
  }

  async moveMonth(direction: -1 | 1): Promise<void> {
    const months = this.cycle?.availableMonths ?? [];
    const next = months[months.indexOf(this.selectedMonth) + direction];
    if (next) await this.load(next);
  }

  async showCurrentMonth(): Promise<void> {
    await this.load(this.currentMonth());
  }

  hasPreviousMonth(): boolean {
    return (this.cycle?.availableMonths.indexOf(this.selectedMonth) ?? -1) > 0;
  }

  hasNextMonth(): boolean {
    const months = this.cycle?.availableMonths ?? [];
    return (months.indexOf(this.selectedMonth) ?? -1) < months.length - 1;
  }

  monthLabel(month: string): string {
    const [year, value] = month.slice(0, 10).split('-').map(Number);
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
      this.cycle = await this.snapshots.getCycle(month);
      this.selectedMonth = this.cycle.cycleStart;
    } catch (error) {
      // A tela não deve congelar se a API local, CORS ou o certificado de desenvolvimento falharem.
      console.error('Falha ao consultar o ciclo local.', error);
      this.error = 'Não foi possível consultar o snapshot local.';
    } finally {
      this.loading = false;
      this.changeDetector.detectChanges();
    }
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }
}
