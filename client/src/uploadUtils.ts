// client/src/uploadUtils.ts
import axios from 'axios';
import { UploadResponse } from './types';

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

/**
 * Converts a data URL to a Blob object.
 * @param dataURL The data URL to convert.
 * @returns A Promise that resolves with the Blob object.
 */
export const dataURLtoBlob = (dataURL: string): Promise<Blob> => {
  return new Promise((resolve) => {
    const arr = dataURL.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png'; // Default to png if mime not found
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);

    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    resolve(new Blob([u8arr], { type: mime }));
  });
};

/**
 * Compresses and resizes an image given its data URL.
 * @param imageDataUrl The image data URL (base64) to compress.
 * @param maxWidth The maximum width for the image.
 * @param maxHeight The maximum height for the image.
 * @param quality The compression quality (0.0 - 1.0).
 * @returns A Promise that resolves with the compressed image data URL (base64).
 */
export const compressImage = (
  imageDataUrl: string,
  maxWidth: number = 1024,
  maxHeight: number = 1024,
  quality: number = 0.8
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = imageDataUrl;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = (error) => {
      console.error('Error loading image for compression:', error);
      resolve(imageDataUrl); // Resolve with original if error occurs
    };
  });
};

/**
 * Uploads a file (Blob) to the specified endpoint.
 * @param file The Blob object to upload.
 * @param token The authorization token.
 * @returns A Promise that resolves with the UploadResponse from the server.
 */
export const uploadFile = async (file: Blob, token: string): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('receipt', file, 'receipt.jpeg'); // 'receipt' should match backend's multer field name

  try {
    const response = await axios.post<UploadResponse>(
      `${apiHost}${apiBaseUrl}/receipts/upload`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Error al subir la imagen'
    };
  }
};
