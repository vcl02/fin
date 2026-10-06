// Home do Hub: apresenta os módulos pessoais sem antecipar funcionalidades que ainda não existem.
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-hub-home',
  imports: [RouterLink],
  templateUrl: './hub-home.component.html',
  styleUrls: ['./hub-home.component.scss'],
})
export class HubHomeComponent {}
