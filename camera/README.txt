Añadir funcionalidad de hacer foto con cámara:

Angular puede integrar funcionalidad de cámara para tomar fotos y enviarlas a un servidor. Aquí tienes una implementación paso a paso:
1. Instalar dependencias necesarias
bash
npm install @angular/cdk
2. Crear el componente de cámara
typescript
// camera.component.ts
import { Component, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-camera',
  template: `
    <div class="camera-container">
      <!-- Vista previa -->
      <video #videoElement autoplay playsinline *ngIf="!photoTaken"></video>
      
      <!-- Captura -->
      <canvas #canvasElement *ngIf="photoTaken"></canvas>
      
      <!-- Controles -->
      <div class="controls">
        <button (click)="startCamera()" *ngIf="!isStreaming">Activar Cámara</button>
        <button (click)="capturePhoto()" *ngIf="isStreaming && !photoTaken">Tomar Foto</button>
        <button (click)="retakePhoto()" *ngIf="photoTaken">Volver a tomar</button>
        <button (click)="uploadPhoto()" *ngIf="photoTaken">Subir Foto</button>
        <button (click)="stopCamera()" *ngIf="isStreaming">Detener Cámara</button>
      </div>
      
      <!-- Estado -->
      <div *ngIf="uploading">Subiendo...</div>
      <div *ngIf="error" class="error">{{ error }}</div>
    </div>
  `,
  styles: [`
    .camera-container {
      max-width: 640px;
      margin: 0 auto;
    }
    video, canvas {
      width: 100%;
      border: 1px solid #ccc;
    }
    .controls {
      margin-top: 1rem;
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .error {
      color: red;
      margin-top: 1rem;
    }
  `]
})
export class CameraComponent {
  @ViewChild('videoElement') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasRef!: ElementRef<HTMLCanvasElement>;
  
  @Output() photoUploaded = new EventEmitter<string>(); // Emite URL o ID de la foto
  
  isStreaming = false;
  photoTaken = false;
  uploading = false;
  error = '';
  
  private stream: MediaStream | null = null;
  private capturedPhoto: string = '';
  
  constructor(private http: HttpClient) {}
  
  async startCamera() {
    try {
      // Solicitar acceso a la cámara
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', // Usar cámara trasera en móviles
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      this.videoRef.nativeElement.srcObject = this.stream;
      this.isStreaming = true;
      this.photoTaken = false;
      this.error = '';
    } catch (err) {
      this.error = 'Error al acceder a la cámara: ' + (err as Error).message;
      console.error('Camera error:', err);
    }
  }
  
  capturePhoto() {
    const video = this.videoRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    
    // Ajustar canvas al tamaño del video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Dibujar el frame actual del video en el canvas
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      this.capturedPhoto = canvas.toDataURL('image/jpeg', 0.8); // Base64
      this.photoTaken = true;
    }
  }
  
  retakePhoto() {
    this.photoTaken = false;
    this.capturedPhoto = '';
  }
  
  async uploadPhoto() {
    if (!this.capturedPhoto) return;
    
    this.uploading = true;
    this.error = '';
    
    try {
      // Convertir Base64 a Blob
      const blob = this.dataURLtoBlob(this.capturedPhoto);
      
      // Crear FormData
      const formData = new FormData();
      formData.append('photo', blob, 'photo.jpg');
      formData.append('timestamp', new Date().toISOString());
      
      // Enviar al servidor (ajusta la URL)
      const response = await this.http.post<any>(
        'https://tu-api.com/upload-photo',
        formData
      ).toPromise();
      
      // Emitir evento con la respuesta
      this.photoUploaded.emit(response.fileUrl || response.fileId);
      
      // Detener cámara después de subir
      this.stopCamera();
      
    } catch (err) {
      this.error = 'Error al subir la foto: ' + (err as Error).message;
      console.error('Upload error:', err);
    } finally {
      this.uploading = false;
    }
  }
  
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.isStreaming = false;
    }
  }
  
  private dataURLtoBlob(dataURL: string): Blob {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new Blob([u8arr], { type: mime });
  }
  
  ngOnDestroy() {
    this.stopCamera();
  }
}
3. Servicio para manejar subidas (opcional)
typescript
// photo.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  private apiUrl = 'https://tu-api.com';
  
  constructor(private http: HttpClient) {}
  
  uploadPhoto(formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/upload-photo`, formData, {
      reportProgress: true,
      observe: 'events' // Para trackear progreso
    });
  }
  
  // Método alternativo con compresión
  compressImage(base64: string, quality = 0.7): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Redimensionar si es muy grande
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;
        
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
    });
  }
}
4. Implementar en un módulo
typescript
// app.module.ts (o módulo específico)
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { CameraComponent } from './camera.component';

@NgModule({
  declarations: [
    CameraComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule // Necesario para las peticiones HTTP
  ],
  exports: [CameraComponent]
})
export class CameraModule { }
5. Usar el componente en otro componente
html
<!-- app.component.html -->
<h1>Tomar y subir foto</h1>
<app-camera 
  (photoUploaded)="onPhotoUploaded($event)">
</app-camera>

<div *ngIf="lastUploadedPhoto">
  <h3>Foto subida exitosamente:</h3>
  <img [src]="lastUploadedPhoto" width="200" />
</div>
typescript
// app.component.ts
export class AppComponent {
  lastUploadedPhoto: string = '';
  
  onPhotoUploaded(photoUrl: string) {
    this.lastUploadedPhoto = photoUrl;
    // Aquí puedes guardar la URL en tu base de datos, etc.
  }
}
6. Ejemplo de endpoint backend (Node.js/Express)
javascript
// server.js (backend)
const express = require('express');
const multer = require('multer');
const path = require('path');
const app = express();

// Configurar almacenamiento
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'));
    }
  }
});

// Ruta para subir foto
app.post('/upload-photo', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ninguna foto' });
  }
  
  // Aquí podrías guardar la referencia en tu base de datos
  const fileUrl = `https://tu-dominio.com/uploads/${req.file.filename}`;
  
  res.json({
    success: true,
    fileUrl,
    fileName: req.file.filename,
    fileSize: req.file.size
  });
});

// Servir archivos estáticos
app.use('/uploads', express.static('uploads'));

app.listen(3000, () => {
  console.log('Servidor en puerto 3000');
});
Consideraciones importantes:
1. HTTPS obligatorio: La cámara solo funciona en HTTPS en producción
2. Permisos del navegador: El usuario debe conceder permisos explícitos
3. Manejo de errores: Implementa buen manejo para diferentes escenarios
4. Optimización de imágenes: Considera comprimir antes de subir
5. Responsive: Asegúrate que funcione bien en móviles y escritorio
6. Seguridad backend: Valida tipos MIME, tamaño, y sanitiza nombres

