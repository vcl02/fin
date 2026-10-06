// Configuração Angular: o primeiro caso de uso real consome somente o contrato HTTP local do Hub.
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection(),
    provideHttpClient(),
    provideRouter(appRoutes),
  ],
};
