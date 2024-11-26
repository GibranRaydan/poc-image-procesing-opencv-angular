import { Component } from '@angular/core';
import { ImageCanvasComponent } from './image-canvas/image-canvas.component';
//import { MultiPageTiffComponent } from './multi-page-tiff-component/multi-page-tiff-component.component';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ImageCanvasComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'ImageProcessingPOC';
}
