// client/src/types.ts

export interface UploadResponse {
  success: boolean;
  url?: string;
  filename?: string;
  size?: number;
  message?: string;
}

export interface CameraCaptureProps {
  onUploadSuccess?: (response: UploadResponse) => void;
  onUploadError?: (error: Error) => void;
  maxSizeKB?: number; // Max size in kilobytes, default 500KB
}
