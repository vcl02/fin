// Cliente HTTP tipado da consulta mensal local; nunca acessa Supabase nem muda o snapshot.
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';

import { environment } from '../../environments/environment';

export interface LegacyFinSnapshotItem {
  id: number;
  competenceDate: string | null;
  nome: string | null;
  valor: number | null;
  categ: string | null;
  freq: string | null;
  pago: boolean | null;
}

export interface LegacyFinCycle {
  cycleStart: string;
  cycleEnd: string;
  availableCycles: string[];
  lastImportAtUtc: string | null;
  sourceRowCount: number;
  debitTotal: number;
  creditTotal: number;
  debitItems: LegacyFinSnapshotItem[];
  creditItems: LegacyFinSnapshotItem[];
}

@Injectable({ providedIn: 'root' })
export class LegacyFinSnapshotService {
  private readonly http = inject(HttpClient);

  getCycle(cycleStart: string): Promise<LegacyFinCycle> {
    const params = new HttpParams().set('cycleStart', cycleStart);
    return firstValueFrom(this.http.get<LegacyFinCycle>(
      `${environment.apis.default.url}/api/app/legacy-fin-snapshot/cycle`,
      { params },
    ).pipe(timeout({ first: 8_000 })));
  }
}
