// Configuração mínima do Hub: mantém o núcleo ABP e o tema Basic, sem módulos de negócio antes da migração do Fin.
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAbpCore, withOptions } from '@abp/ng.core';
import { registerLocaleForEsBuild } from '@abp/ng.core/locale';
import { provideThemeBasicConfig } from '@abp/ng.theme.basic';
import { provideAbpThemeShared, provideLogo, withEnvironmentOptions } from '@abp/ng.theme.shared';

import { appRoutes } from './app.routes';
import { APP_ROUTE_PROVIDER } from './route.provider';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(appRoutes),
    APP_ROUTE_PROVIDER,
    provideAbpCore(withOptions({ environment, registerLocaleFn: registerLocaleForEsBuild() })),
    provideThemeBasicConfig(),
    provideLogo(withEnvironmentOptions(environment)),
    provideAbpThemeShared(),
  ],
};
