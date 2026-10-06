import { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: '',
    title: 'Hub pessoal',
    loadComponent: () => import('./hub-home/hub-home.component').then(m => m.HubHomeComponent),
  },
  {
    path: 'fin',
    title: 'fin',
    loadChildren: () => import('./home/home.routes').then(m => m.homeRoutes),
  },
];
