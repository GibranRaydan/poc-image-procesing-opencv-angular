import { Component, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import * as UTIF from 'utif'; // Import UTIF.js

declare var cv: any; // Declare OpenCV.js

@Component({
  selector: 'app-image-canvas',
  standalone: true,
  templateUrl: './image-canvas.component.html',
  styleUrls: ['./image-canvas.component.css']
})
export class ImageCanvasComponent implements AfterViewInit {
  @ViewChild('imageCanvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private imageMat!: any;
  private isOpenCvLoaded = false;

  tiffPages: any[] = [];
  currentPageIndex: number = 0;
  processedPages: HTMLCanvasElement[] = []; // Store processed PNG canvases
  originalPages: HTMLCanvasElement[] = []; // Store original PNG canvases
  tiffBuffer: ArrayBuffer | null = null;

  stageHistory: HTMLCanvasElement[][] = []; // History stack for each page


  ngAfterViewInit() {
    this.ctx = this.canvas.nativeElement.getContext('2d')!;
    this.loadOpenCv();
  }

  loadOpenCv() {
    const interval = setInterval(() => {
      if (cv && cv.Mat) {
        this.isOpenCvLoaded = true;
        console.log('OpenCV.js is loaded');
        clearInterval(interval);
      }
    }, 100);
  }

  async loadFolder(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      const files = Array.from(input.files).filter(file => file.name.endsWith('.tif') || file.name.endsWith('.tiff'));
      if (files.length === 0) {
        console.error('No TIFF files found in the selected folder');
        return;
      }

      // Process each TIFF file
      for (const file of files) {
        await this.processTiffFile(file);
      }
    }
  }

  async processTiffFile(file: File) {
    this.tiffBuffer = await file.arrayBuffer();
    this.tiffPages = UTIF.decode(this.tiffBuffer);

    // Decode each page and convert to PNG
    this.originalPages = await Promise.all(
      this.tiffPages.map(page => this.convertTiffPageToPng(page))
    );

    // Render the first page by default
    this.renderPage(this.currentPageIndex);
  }

  async convertTiffPageToPng(page: any): Promise<HTMLCanvasElement> {
    UTIF.decodeImage(this.tiffBuffer!, page); // Decode the TIFF page to RGBA8
    const rgba = UTIF.toRGBA8(page);

    // Create a canvas and render the TIFF page as PNG
    const canvas = document.createElement('canvas');
    canvas.width = page.width;
    canvas.height = page.height;

    const ctx = canvas.getContext('2d')!;
    const imgData = new ImageData(new Uint8ClampedArray(rgba), page.width, page.height);
    ctx.putImageData(imgData, 0, 0);

    return canvas; // Return the canvas containing the PNG
  }

  renderPage(pageIndex: number) {
    if (pageIndex < 0 || pageIndex >= this.originalPages.length) {
      console.error('Page index out of bounds');
      return;
    }

    // Update the current page index
    this.currentPageIndex = pageIndex;

    // If there is a processed image for the current page, render it; otherwise, render the original
    const canvasToRender =
      this.processedPages[pageIndex] || this.originalPages[pageIndex];

    // Reset stage history for this page
    this.stageHistory[pageIndex] = [canvasToRender];

    // Update the canvas size and render the selected image
    this.canvas.nativeElement.width = canvasToRender.width;
    this.canvas.nativeElement.height = canvasToRender.height;
    this.ctx.drawImage(canvasToRender, 0, 0);

    // Update `imageMat` with the rendered canvas
    const src = cv.imread(canvasToRender);
    this.imageMat = src.clone();
    src.delete();
  }

  prevPage() {
    if (this.currentPageIndex > 0) {
      this.currentPageIndex -= 1;
      this.renderPage(this.currentPageIndex);
    }
  }

  nextPage() {
    if (this.currentPageIndex < this.originalPages.length - 1) {
      this.currentPageIndex += 1;
      this.renderPage(this.currentPageIndex);
    }
  }

  deskewImageAutomatically() {
    if (!this.isOpenCvLoaded || !this.imageMat) return console.error('OpenCV.js is not loaded or image is not loaded');

    const gray = new cv.Mat();
    cv.cvtColor(this.imageMat, gray, cv.COLOR_RGBA2GRAY, 0);

    const edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxRect = null;
    let largestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const rect = cv.minAreaRect(contours.get(i));
      const area = rect.size.width * rect.size.height;
      if (area > largestArea) {
        largestArea = area;
        maxRect = rect;
      }
    }

    if (maxRect) {
      const angle = maxRect.angle;
      this.rotateImage(-angle); // Deskew based on angle
    }

    gray.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }

  rotateImage(angle: number) {
    if (!this.imageMat) {
      console.error('Image is not loaded');
      return;
    }

    // Save current canvas to history
    const currentCanvas = document.createElement('canvas');
    currentCanvas.width = this.canvas.nativeElement.width;
    currentCanvas.height = this.canvas.nativeElement.height;
    const currentCtx = currentCanvas.getContext('2d')!;
    currentCtx.drawImage(this.canvas.nativeElement, 0, 0);
    this.stageHistory[this.currentPageIndex].push(currentCanvas);

    // Apply rotation
    const center = new cv.Point(this.imageMat.cols / 2, this.imageMat.rows / 2);
    const M = cv.getRotationMatrix2D(center, angle, 1);
    const rotated = new cv.Mat();
    cv.warpAffine(this.imageMat, rotated, M, new cv.Size(this.imageMat.cols, this.imageMat.rows), cv.INTER_CUBIC, cv.BORDER_CONSTANT, new cv.Scalar());

    // Save the rotated image in a new canvas
    const processedCanvas = document.createElement('canvas');
    processedCanvas.width = rotated.cols;
    processedCanvas.height = rotated.rows;
    cv.imshow(processedCanvas, rotated);

    this.processedPages[this.currentPageIndex] = processedCanvas; // Store canvas instead of Mat
    this.imageMat = rotated.clone();

    cv.imshow(this.canvas.nativeElement, rotated);

    rotated.delete();
    M.delete();
  }

  previousStage() {
    const historyStack = this.stageHistory[this.currentPageIndex];

    if (!historyStack || historyStack.length === 0) {
      console.error('No previous stage available');
      return;
    }

    // Remove the last stage from the stack
    const previousCanvas = historyStack.pop()!;

    // Update the main canvas with the previous stage
    this.canvas.nativeElement.width = previousCanvas.width;
    this.canvas.nativeElement.height = previousCanvas.height;
    this.ctx.drawImage(previousCanvas, 0, 0);

    // Update imageMat to reflect the reverted state
    const src = cv.imread(previousCanvas);
    this.imageMat = src.clone();
    src.delete();
  }

  downloadPngs() {
    const allPages = this.originalPages.map((original, index) => {
      return this.processedPages[index] || original;
    });

    if (allPages.length === 0) {
      console.error('No images to download.');
      return;
    }

    // Loop through all pages (processed or original) and download as PNG
    allPages.forEach((canvas, index) => {
      if (!canvas) {
        console.error(`Page ${index + 1} is missing.`);
        return;
      }

      // Convert canvas to a blob and trigger the download
      canvas.toBlob((blob) => {
        if (blob) {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `page-${index + 1}.png`;

          // Trigger the download
          link.click();

          // Clean up memory
          URL.revokeObjectURL(link.href);
        } else {
          console.error(`Failed to create PNG blob for page ${index + 1}`);
        }
      }, 'image/png');
    });

  }
    //processImageWithOpenCV() {
    //  if (!this.isOpenCvLoaded) {
    //    console.error('OpenCV.js is not loaded yet');
    //    return;
    //  }

    //  // Read the canvas content into an OpenCV Mat
    //  const src = cv.imread(this.canvas.nativeElement); // Load canvas content into a Mat
    //  this.imageMat = src.clone(); // Store the Mat for further processing
    //  //this.saveToHistory(this.imageMat); // Save the state for undo functionality

    //  // Example: Convert the image to grayscale
    //  const gray = new cv.Mat();
    //  cv.cvtColor(this.imageMat, gray, cv.COLOR_RGBA2GRAY);

    //  // Show the processed image back on the canvas
    //  cv.imshow(this.canvas.nativeElement, gray);

    //  // Clean up to prevent memory leaks
    //  src.delete();
    //  gray.delete();
    //}

    //saveAsPng() {
    //  const canvas = this.canvas.nativeElement;
    //  const dataUrl = canvas.toDataURL('image/png'); // Convert to PNG

    //  // Optional: Download the converted image
    //  const link = document.createElement('a');
    //  link.href = dataUrl;
    //  link.download = 'converted-image.png';
    //  link.click();
    //}





    //@HostListener('mousedown', ['$event'])
    //startSelection(event: MouseEvent) {
    //  this.isSelecting = true;
    //  this.isSelectionMade = false; // Reset the selection made flag
    //  const rect = this.canvas.nativeElement.getBoundingClientRect();
    //  this.selectionStart.x = event.clientX - rect.left;
    //  this.selectionStart.y = event.clientY - rect.top;
    //}

    //@HostListener('mousemove', ['$event'])
    //updateSelection(event: MouseEvent) {
    //  if (this.isSelecting) {
    //    const rect = this.canvas.nativeElement.getBoundingClientRect();
    //    this.selectionEnd.x = event.clientX - rect.left;
    //    this.selectionEnd.y = event.clientY - rect.top;
    //    this.drawSelectionBox();
    //  }
    //}

    //@HostListener('mouseup')
    //endSelection() {
    //  this.isSelecting = false;
    //  this.isSelectionMade = true; // Enable the button once selection is done
    //}

    //drawSelectionBox() {
    //  const x = this.selectionStart.x;
    //  const y = this.selectionStart.y;
    //  const width = this.selectionEnd.x - this.selectionStart.x;
    //  const height = this.selectionEnd.y - this.selectionStart.y;

    //  cv.imshow(this.canvas.nativeElement, this.imageMat);
    //  this.ctx.strokeStyle = 'blue';
    //  this.ctx.lineWidth = 3; // Make it thicker
    //  this.ctx.strokeRect(x, y, width, height);
    //}

    //applyDarkenTextOnlyInSelection() {
    //  if (!this.imageMat || !this.isSelectionMade) return console.error('Image not loaded or no selection made');


    //  this.saveToHistory();
    //  const x = Math.min(this.selectionStart.x, this.selectionEnd.x);
    //  const y = Math.min(this.selectionStart.y, this.selectionEnd.y);
    //  const width = Math.abs(this.selectionEnd.x - this.selectionStart.x);
    //  const height = Math.abs(this.selectionEnd.y - this.selectionStart.y);

    //  const selectedRect = new cv.Rect(x, y, width, height);
    //  const selectedRegion = this.imageMat.roi(selectedRect);

    //  const gray = new cv.Mat();
    //  cv.cvtColor(selectedRegion, gray, cv.COLOR_RGBA2GRAY, 0);

    //  const binary = new cv.Mat();
    //  cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

    //  const contours = new cv.MatVector();
    //  const hierarchy = new cv.Mat();
    //  cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    //  const darkenedRegion = selectedRegion.clone();
    //  for (let i = 0; i < contours.size(); i++) {
    //    const mask = cv.Mat.zeros(selectedRegion.rows, selectedRegion.cols, cv.CV_8UC1);
    //    cv.drawContours(mask, contours, i, new cv.Scalar(255), -1);

    //    for (let row = 0; row < darkenedRegion.rows; row++) {
    //      for (let col = 0; col < darkenedRegion.cols; col++) {
    //        if (mask.ucharAt(row, col) === 255) {
    //          const pixel = darkenedRegion.ucharPtr(row, col);
    //          pixel[0] = Math.max(0, pixel[0] * 0.7);
    //          pixel[1] = Math.max(0, pixel[1] * 0.7);
    //          pixel[2] = Math.max(0, pixel[2] * 0.7);
    //        }
    //      }
    //    }

    //    mask.delete();
    //  }

    //  darkenedRegion.copyTo(selectedRegion);
    //  cv.imshow(this.canvas.nativeElement, this.imageMat);

    //  gray.delete();
    //  binary.delete();
    //  contours.delete();
    //  hierarchy.delete();
    //  darkenedRegion.delete();
    //}



    //removeBorder() {
    //  if (!this.imageMat) return console.error('Image is not loaded');

    //  this.saveToHistory(); // Save state before processing

    //  const gray = new cv.Mat();
    //  cv.cvtColor(this.imageMat, gray, cv.COLOR_RGBA2GRAY, 0);

    //  const binary = new cv.Mat();
    //  cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

    //  const invertedBinary = new cv.Mat();
    //  cv.bitwise_not(binary, invertedBinary);

    //  const contours = new cv.MatVector();
    //  const hierarchy = new cv.Mat();
    //  cv.findContours(invertedBinary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    //  let largestArea = 0;
    //  let largestContour = null;

    //  for (let i = 0; i < contours.size(); i++) {
    //    const area = cv.contourArea(contours.get(i));
    //    if (area > largestArea) {
    //      largestArea = area;
    //      largestContour = contours.get(i);
    //    }
    //  }

    //  if (largestContour) {
    //    const boundingRect = cv.boundingRect(largestContour);
    //    const margin = 10;
    //    const x = Math.max(boundingRect.x - margin, 0);
    //    const y = Math.max(boundingRect.y - margin, 0);
    //    const width = Math.min(boundingRect.width + 2 * margin, this.imageMat.cols - x);
    //    const height = Math.min(boundingRect.height + 2 * margin, this.imageMat.rows - y);

    //    const croppedImage = this.imageMat.roi(new cv.Rect(x, y, width, height));
    //    cv.imshow(this.canvas.nativeElement, croppedImage);

    //    croppedImage.delete();
    //  } else {
    //    console.error('No suitable contour found');
    //  }

    //  gray.delete();
    //  binary.delete();
    //  invertedBinary.delete();
    //  contours.delete();
    //  hierarchy.delete();
    //}



    //applyEffect(effect: 'darken' | 'lighten') {
    //  if (!this.imageMat) return console.error('Image is not loaded');
    //  this.saveToHistory();

    //  let alpha = effect === 'darken' ? 0.7 : 1.3;
    //  this.imageMat.convertTo(this.imageMat, -1, alpha, 0); // Efficient brightness adjustment
    //  cv.imshow(this.canvas.nativeElement, this.imageMat);
    //}



  
}
