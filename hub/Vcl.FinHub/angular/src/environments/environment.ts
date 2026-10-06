const baseUrl = 'http://localhost:4200';

export const environment = {
  production: false,
  application: {
    baseUrl,
    name: 'FinHub',
    logoUrl: '',
  },
  oAuthConfig: {
    issuer: 'https://localhost:44391/',
    redirectUri: baseUrl,
    clientId: 'FinHub_App',
    responseType: 'code',
    scope: 'offline_access FinHub',
    requireHttps: true,
  },
  apis: {
    default: {
      url: 'https://localhost:44391',
      rootNamespace: 'Vcl.FinHub',
    },
  },
};
