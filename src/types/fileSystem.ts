export type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader: () => {
    readEntries: (
      cb: (ents: unknown[]) => void,
      err?: (e: unknown) => void
    ) => void;
  };
};
