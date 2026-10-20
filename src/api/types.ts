/** Shapes returned by FileBrowser Quantum v2.0.1-stable (checked against a live server). */

export type SourcePermissions = {
  view: boolean;
  download: boolean;
  modify: boolean;
  delete: boolean;
  create: boolean;
};

export type UserScope = {
  name: string;
  scope: string;
  permissions: SourcePermissions;
};

export type User = {
  username: string;
  loginMethod: 'password' | 'ldap' | 'oidc' | 'proxy' | 'jwt' | string;
  scopes: UserScope[];
  permissions: { api: boolean; admin: boolean; share: boolean; realtime: boolean };
  lockPassword: boolean;
  requirePasswordChange: boolean;
  otpEnabled: boolean;
  showHidden: boolean;
  fileLoading: {
    maxConcurrentUpload: number;
    uploadChunkSizeMb: number;
    downloadChunkSizeMb: number;
  };
  preview: { image: boolean; video: boolean; audio: boolean; folder: boolean };
  disablePreviewExt: string;
};

export type SourceInfo = {
  name: string;
  readOnly: boolean;
  private: boolean;
  status: string;
  /** Size of the indexed files. */
  used: number;
  /** Used space on the source's whole filesystem (total minus available, like df). */
  usedAlt?: number;
  total: number;
  numFiles: number;
  numDirs: number;
};

export type RawItem = {
  name: string;
  size: number;
  modified: string;
  type: string;
  hidden: boolean;
  hasPreview: boolean;
};

export type RawListing = RawItem & {
  path: string;
  source: string;
  files?: RawItem[];
  folders?: RawItem[];
};

/** A listing entry with the fields the app derives from its parent listing. */
export type FileItem = RawItem & {
  source: string;
  /** Absolute path in the source; directories end with "/". */
  path: string;
  isDir: boolean;
};

export type Listing = {
  source: string;
  path: string;
  name: string;
  /** Size of the folder with everything in it. */
  size: number;
  items: FileItem[];
};

export type ShareLink = {
  hash: string;
  path: string;
  source: string;
  /** Unix seconds, 0 for permanent shares. */
  expire: number;
  username: string;
  shareURL: string;
  downloadURL: string;
  singleFileShare: boolean;
  pathExists: boolean;
  canEditShare: boolean;
  /** Unix seconds, from the activity log; not part of the share API. See `useShares`. */
  createdAt?: number;
  /** The activity event's id: rises with every event, so it orders links made in the same second. */
  createdSeq?: number;
};

export type SearchResult = {
  /** Relative to the source root, no leading slash. */
  path: string;
  type: string;
  size: number;
  modified: string;
  hasPreview: boolean;
  source: string;
};

/** Public values the server embeds in its web page as `globalVars`. */
export type ServerGlobals = {
  name: string;
  version: string;
  passwordAvailable: boolean;
  ldapAvailable: boolean;
  enableThumbs: boolean;
  minSearchLength: number;
  passwordMinLength: number;
  mediaAvailable: boolean;
  /** Proxy auth: the server takes the username from a header set by a gateway in front of it. */
  proxyAvailable: boolean;
};

export type ServerInfo = ServerGlobals & {
  /** Normalized base URL without a trailing slash. */
  baseUrl: string;
  /** Requests have to pass a sign-in gateway (forward auth) first. */
  gateway?: boolean;
};
