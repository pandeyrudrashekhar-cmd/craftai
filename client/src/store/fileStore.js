import { create } from 'zustand';

import * as fileService from '../services/fileService.js';

const errorMessage = (error) =>
  error.response?.data?.error ??
  'Unable to manage project files. Please try again.';

export const useFileStore = create((set, get) => ({

  files: [],
  selectedFile: null,
  loading: false,
  loadingFile: false,
  saving: false,
  error: null,
  activeProjectId: null,
  requestVersion: 0,

  clearFiles: () =>
    set((state) => ({
      files: [],
      selectedFile: null,
      loading: false,
      loadingFile: false,
      saving: false,
      error: null,
      activeProjectId: null,
      requestVersion: state.requestVersion + 1
    })),

  loadFiles: async (projectId) => {
    const requestVersion = get().requestVersion + 1;
    set({ loading: true, error: null, activeProjectId: projectId, requestVersion });

    try {
      const files = await fileService.fetchFiles(projectId);

      if (get().activeProjectId !== projectId || get().requestVersion !== requestVersion) return [];
      set({ files });

      return files;
    } catch (error) {
      if (get().activeProjectId === projectId && get().requestVersion === requestVersion) set({ error: errorMessage(error) });
      return [];
    } finally {
      if (get().activeProjectId === projectId && get().requestVersion === requestVersion) set({ loading: false });
    }
  },

  selectFile: async (projectId, fileId) => {
    const requestVersion = get().requestVersion;
    set({ loadingFile: true, error: null });

    try {
      const selectedFile = await fileService.fetchFile(
        projectId,
        fileId
      );

      if (get().activeProjectId !== projectId || get().requestVersion !== requestVersion) return null;
      set({ selectedFile });

      return selectedFile;
    } catch (error) {
      if (get().activeProjectId === projectId && get().requestVersion === requestVersion) set({ error: errorMessage(error) });
      return null;
    } finally {
      if (get().activeProjectId === projectId && get().requestVersion === requestVersion) set({ loadingFile: false });
    }
  },

  createFile: async (projectId, payload) => {
    const file = await fileService.createFile(projectId, payload);
    if (get().activeProjectId !== projectId) return file;

    set((state) => ({
      files: [...state.files, file].sort((a, b) =>
        a.path.localeCompare(b.path)
      ),
      selectedFile: file
    }));

    return file;
  },

  saveFile: async (projectId, fileId, content) => {
    const requestVersion = get().requestVersion;
    set({ saving: true, error: null });

    try {
      const file = await fileService.updateFile(
        projectId,
        fileId,
        content
      );

      if (get().activeProjectId !== projectId || get().requestVersion !== requestVersion) return file;
      set((state) => ({
        selectedFile:
          state.selectedFile?.id === file.id
            ? file
            : state.selectedFile,

        files: state.files.map((item) =>
          item.id === file.id
            ? { ...item, ...file }
            : item
        )
      }));

      return file;
    } catch (error) {
      if (get().activeProjectId === projectId && get().requestVersion === requestVersion) set({ error: errorMessage(error) });
      throw error;
    } finally {
      if (get().activeProjectId === projectId && get().requestVersion === requestVersion) set({ saving: false });
    }
  },

  deleteFile: async (projectId, fileId) => {
    await fileService.deleteFile(projectId, fileId);
    if (get().activeProjectId !== projectId) return;

    set((state) => ({
      files: state.files.filter(
        (file) => file.id !== fileId
      ),

      selectedFile:
        state.selectedFile?.id === fileId
          ? null
          : state.selectedFile
    }));
  },

  initializeFiles: async (projectId) => {
    const files = await fileService.initializeFiles(projectId);
    if (get().activeProjectId !== projectId) return files;

    set({
      files
    });

    return files;
  },

  // Used by both:
  // 1. AI file updates
  // 2. Version restore
  //
  // IMPORTANT:
  // We merge using file.path instead of file.id.
  // Restore creates new database IDs, while AI updates
  // may only send a subset of the project files.
  applyFiles: (updatedFiles) =>
    set((state) => {

      // Remember which file the user currently has open.
      const selectedPath = state.selectedFile?.path;

      // Existing files indexed by PATH.
      // Path is stable even if the database ID changes
      // after restoring a version.
      const byPath = new Map(
        state.files.map((file) => [file.path, file])
      );

      // Apply the incoming files.
      //
      // If AI changed only App.jsx:
      //   App.jsx gets replaced
      //   index.css stays
      //   main.jsx stays
      //   package.json stays
      //
      // If restore returns all files:
      //   every matching path gets replaced with
      //   the restored version.
      updatedFiles.forEach((file) => {
        byPath.set(file.path, file);
      });

      // Convert map back to array and keep files sorted.
      const nextFiles = [...byPath.values()].sort((a, b) =>
        a.path.localeCompare(b.path)
      );

      // Keep the currently selected file if it still exists.
      //
      // We use PATH instead of ID because restore can create
      // a new ID for the same file.
      const selectedFile =
        selectedPath
          ? nextFiles.find(
              (file) => file.path === selectedPath
            ) ?? null
          : nextFiles[0] ?? null;

      return {
        files: nextFiles,
        selectedFile
      };
    })

}));