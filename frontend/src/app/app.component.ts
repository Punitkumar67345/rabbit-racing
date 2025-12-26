import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
// 1. Yahan humne Game Component ko bulaya (Import kiya)
import { GameComponent } from './components/game/game.component';

@Component({
  selector: 'app-root',
  standalone: true,
  // 2. Yahan humne App ko bataya ki GameComponent use karna hai
  imports: [RouterOutlet, GameComponent], 
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'StealthGame';
}