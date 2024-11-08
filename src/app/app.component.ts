import { Component } from '@angular/core';
import { ImageCanvasComponent } from './image-canvas/image-canvas.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ImageCanvasComponent],  // Add the ImageCanvasComponent here
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'ImageProcessingPOC';
}
