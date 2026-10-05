import { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'fin',
  },
  {
    path: 'fin',
    title: 'fin',
    loadChildren: () => import('./home/home.routes').then(m => m.homeRoutes),
  },
];
