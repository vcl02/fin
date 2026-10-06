import { Routes } from '@angular/router';

export const homeRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'fin',
    loadComponent: () => import('../native-transactions/native-transactions.component').then(m => m.NativeTransactionsComponent),
  },
  {
    path: 'conferencia',
    title: 'Conferência · fin',
    loadComponent: () => import('./home.component').then(m => m.HomeComponent),
  },
];
