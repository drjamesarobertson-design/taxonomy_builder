// Minimal ambient types for the parts of the File System Access API this project uses
// (Chromium browsers only) that aren't yet in TypeScript's bundled DOM lib: picking a
// folder via window.showDirectoryPicker, and checking/requesting read-write permission on
// a previously obtained handle.

export {};

declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite';
  }

  interface FileSystemHandle {
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  }

  type WellKnownDirectory = 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';

  interface DirectoryPickerOptions {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: FileSystemHandle | WellKnownDirectory;
  }

  interface Window {
    showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
  }
}
