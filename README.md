# FileBrowser Quantum for Android

An Android app for self-hosted [FileBrowser Quantum](https://github.com/gtsteffaniak/filebrowser)
servers. Browse, upload, download and share your files from your phone.

The app covers everyday file work. Server administration, user management and the other tools
stay in the web UI.

<p align="center">
  <img src="docs/screenshots/photos.png" width="200" alt="Photos folder in grid view with thumbnails">
  <img src="docs/screenshots/actions.png" width="200" alt="Actions for a file">
  <img src="docs/screenshots/share.png" width="200" alt="A share with its preview and download links">
  <img src="docs/screenshots/settings.png" width="200" alt="Settings with two servers">
</p>

## Features

- **Several servers.** Add as many servers as you like, give each one your own name and switch
  between them. Each server keeps its own sign-in.
- **Sign-in.** Password (including LDAP) and two-factor codes (TOTP). Servers that require a
  password change on first login are handled too.
- **Browse.** List or grid view, thumbnails, sort by name, size or date, and search.
- **Manage files.** Create folders, rename, move, copy and delete, one at a time or several at
  once.
- **Upload** from the file picker, the photo gallery, or a whole folder with its subfolders.
  Large files go up in chunks, retry after short network drops, and resume where they stopped.
- **Download** to a device folder you pick once. Folders and multiple items download as a zip.
- **View** images, video and audio in the app. Other files open in the app of your choice.
- **Share.** Create share links with an optional expiry and password, copy or send them, and
  manage your shares in one list.
- **Storage.** Settings shows how much each source holds and how much free space is left on its
  disk, in red with a warning once the disk is almost full. Uploads that wouldn't fit are stopped
  before they start, since the server doesn't check.
- **Transfers.** A tab with progress, speed and history for uploads and downloads, with cancel
  and retry. Transfers keep going when you switch servers.
- **Screen lock** with fingerprint, face or device PIN. It locks again after a delay you choose.
- **English and Ukrainian.** The app follows the phone's language and switches as soon as you
  change it. On Android 13 and later you can also pick the app's language on its own in
  Settings → Apps.
- **Follows the server's look.** Same names, wording and colours as the web UI, plus light and
  dark themes that follow the system.

## What it covers

The app is built on the server's own API (the Go backend), the same one the web UI uses. It
covers part of it:

| Covered by the app                                                                                    | Left to the web UI                                                                                                               |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in with password or LDAP, two-factor codes, required password change, session renewal and logout | Single sign-on (OIDC), proxy auth and passkeys                                                                                   |
| Listing, creating, renaming, moving, copying and deleting files and folders                           | User management, access rules and server settings                                                                                |
| Chunked uploads, single-file and zip downloads                                                        | Duplicate finder, size viewer, file watcher, activity log and advanced search                                                    |
| Thumbnails, image viewer, video and audio playback                                                    | Built-in editors and viewers (text, Markdown, OnlyOffice, documents, EPUB, 3D). The app opens these files in another app instead |
| Share links with expiry and password, listing and deleting your shares                                | Share customisation beyond expiry and password, API tokens, notifications, pinned items                                          |
| Basic search, changing your own password                                                              | Other profile and display preferences                                                                                            |

### Why it's kept simple

The scope is narrow on purpose:

- **It fits phone use.** On a phone you mostly find a file, open it, send it or upload a photo.
  Administration and power tools are rare tasks that work better on a big screen, and the web
  UI already does them well.
- **Less can break.** Every API call the app makes is one more thing a server update can
  change. A small surface means fewer of those, and each one was checked against
  v2.0.1-stable.
- **It's easier to test and maintain.** Every feature listed here was tried on a real phone.
  A smaller app keeps that realistic.

Anything the app leaves out is still in the web UI on the same server.

## Requirements

- Android.
- A FileBrowser Quantum server, version 2.0.x. The app shows a warning on other versions.
- The server address, including its subpath if it has one, such as `https://files.example.com`
  or `https://example.com/files`.

Plain `http://` servers work, but the app warns that your password and files travel
unencrypted. Use HTTPS for anything outside your home network.

## Privacy

The app doesn't collect any data about you. There are no analytics, no tracking, no ads and no
crash reporting.

- The app only talks to the servers you add. Nothing goes to the app's developer or any third
  party.
- Your session token is kept in Android's encrypted secure storage. Your password isn't stored.
- Server addresses and settings stay on the device. Removing a server signs you out of it and
  forgets its address and session.

## Testing

The app was tested on a physical Android phone, running in Expo Go (SDK 57), against
FileBrowser Quantum **v2.0.1-stable** servers running in Docker, and against a real
self-hosted server over HTTPS. That covered:

- adding servers, with and without a subpath, and switching between them
- password sign-in and two-factor codes
- browsing several sources, thumbnails, list and grid views
- the used and free space shown for each source, the almost-full warning and uploads blocked on
  a full disk
- creating, renaming, moving, copying and deleting files and folders, including bulk actions
- uploads from the file picker and the gallery, including while switching servers
- folder uploads with subfolders
- files of different types and sizes, from a few KB to about 1 GB: APKs, ISO images, zip
  archives, MP4 videos and images
- cancelling, retrying and resuming large uploads, and recovering from network drops
- downloads of single files and of folders as zip
- the image viewer and video playback
- creating and deleting shares, and copying their links
- the screen lock and its timeout

iOS isn't supported.

## Development

You need Node.js and an Android phone with [Expo Go](https://expo.dev/go), or a development
build.

```bash
npm install      # also installs the git hooks (husky)
npx expo start   # then scan the QR code with Expo Go
```

Checks:

```bash
npm run lint       # ESLint (eslint-config-expo) + Prettier
npm run typecheck  # tsc --noEmit
npm run format     # Prettier --write
```

The pre-commit hook runs lint-staged: `eslint --fix` and Prettier on staged files, then a
project-wide `tsc --noEmit`.

To test against a local server, run the `gtstef/filebrowser:2.0.1-stable` Docker image (see the
[upstream docs](https://github.com/gtsteffaniak/filebrowser) for configuration) and publish it on
port 8080. With the phone on USB, `adb reverse tcp:8080 tcp:8080` makes it reachable from the app
as `http://localhost:8080`.

### Project layout

```
src/app/         screens and navigation (Expo Router)
src/api/         FileBrowser Quantum API client
src/session/     servers, sign-in and preferences
src/transfers/   upload and download queue
src/lock/        screen lock
src/components/  shared UI
src/i18n/        translations (keys match the web UI)
```

## Credits

- [FileBrowser Quantum](https://github.com/gtsteffaniak/filebrowser) by gtsteffaniak. The logo
  and the interface text come from that project, which is licensed under Apache-2.0.
- This is an independent client, not affiliated with the FileBrowser Quantum project.
- I don't have deep React Native experience, so the project structure
  may not be perfect. The app has been tested and works, and suggestions are welcome.

## License

[MIT](LICENSE). The FileBrowser Quantum logo and interface text keep their Apache-2.0 license.

Built with [Expo](https://expo.dev) and an AI coding agent
([Claude Code](https://claude.com/claude-code)).
