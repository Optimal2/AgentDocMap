# Modules

## server

Files: 2. Lines: 508. JSDoc symbols: 7.

- `server/system-log-server.js` - Token auth middleware
- `server/user-log-server.js` - Resolve user identity without cookies.

## src/app

Files: 3. Lines: 731. JSDoc symbols: 20.

- `src/app/AppBootstrap.jsx` - Session metadata for a bundle.
- `src/app/OpenDocViewer.jsx` - OpenDocViewer — Top-level component.
- `src/app/bootConfig.js` - Return the application base path (always with a trailing slash) derived from the current page URL.

## src/components

Files: 13. Lines: 6527. JSDoc symbols: 82.

- `src/components/DocumentThumbnailList.jsx` - Build a center-out thumbnail warm-up order so the pane feels responsive around the user's current scroll target instead of always starting from page 1.
- `src/components/DocumentRender.jsx` - Reset the per-page blob-URL retry tracker after a successful load or when the target page changes.
- `src/components/PrintSelectionWorkspace.jsx` - Exports PrintSelectionWorkspace.
- `src/components/Resizer.jsx` - Resizer component.
- `src/components/LoadingSpinner.jsx` - LoadingSpinner component.
- `src/components/ViewerProblemNotice.jsx` - Exports ViewerProblemNotice.
- `src/components/DocumentConsumerWrapper.jsx` - DocumentConsumerWrapper Wraps DocumentLoader + DocumentViewer and switches between full viewer and a thumbnail-only presentation on small/mobile layouts.
- `src/components/DocumentMetadataMatrixOverlayDialog.jsx` - Exports DocumentMetadataMatrixOverlayDialog.

## src/components/common

Files: 1. Lines: 36. JSDoc symbols: 1.

- `src/components/common/StatusLed.jsx` - Exports StatusLed.

## src/components/DocumentLoader

Files: 8. Lines: 3984. JSDoc symbols: 107.

- `src/components/DocumentLoader/documentLoaderUtils.js` - Generate a list of document URLs using a simple pattern: 001..NNN + extension.
- `src/components/DocumentLoader/DocumentLoader.js` - Resolve source type information with a cheap signature-first path.
- `src/components/DocumentLoader/mainThreadRenderer.js` - Render PDF pages on the main thread and INSERT THEM DIRECTLY.
- `src/components/DocumentLoader/workerHandler.js` - Create a new image worker instance.
- `src/components/DocumentLoader/sources/explicitListSource.js` - Convert a PortableDocumentBundle into a flat, ordered list of file URLs.
- `src/components/DocumentLoader/batchHandler.js` - Batch scheduler entry point.
- `src/components/DocumentLoader/LoadPressureDialog.jsx` - Large-load warning dialog shown before / during very heavy loading runs.
- `src/components/DocumentLoader/DemoControls.jsx` - DemoControls — wraps DocumentLoader with demo-mode props and a small control UI.

## src/components/DocumentToolbar

Files: 14. Lines: 6326. JSDoc symbols: 90.

- `src/components/DocumentToolbar/usePrintRangeDialog.js` - Read the runtime configuration (merged defaults + site overrides).
- `src/components/DocumentToolbar/DocumentToolbar.jsx` - Toolbar shell for page navigation, zoom, comparison, image adjustments, help, language, and print entry.
- `src/components/DocumentToolbar/usePdfPrebuildAllPages.js` - Run async work with bounded concurrency.
- `src/components/DocumentToolbar/ManualOverlayDialog.jsx` - Exports ManualOverlayDialog.
- `src/components/DocumentToolbar/ThemeMenuButton.jsx` - Exports ThemeMenuButton.
- `src/components/DocumentToolbar/LanguageMenuButton.jsx` - Exports LanguageMenuButton.
- `src/components/DocumentToolbar/AboutOverlayDialog.jsx` - Exports AboutOverlayDialog.
- `src/components/DocumentToolbar/SplitToolbarButton.jsx` - Exports SplitToolbarButton.

## src/components/DocumentViewer

Files: 8. Lines: 4717. JSDoc symbols: 106.

- `src/components/DocumentViewer/useDocumentViewer.js` - Hook that centralizes viewer UI state and event handlers.
- `src/components/DocumentViewer/DocumentViewerRender.jsx` - DocumentViewerRender Renders the main document pane and, if enabled, a comparison pane.
- `src/components/DocumentViewer/hooks/useViewerEffects.js` - File: src/components/DocumentViewer/hooks/useViewerEffects.js Cross-cutting viewer effects: Sync zoomState.scale from numeric zoom Sticky Fit recomputation on relevant changes Res...
- `src/components/DocumentViewer/hooks/useViewerPostZoom.js` - File: src/components/DocumentViewer/hooks/useViewerPostZoom.js Encapsulates per-pane "post-zoom" state & handlers used only in compare mode.
- `src/components/DocumentViewer/DocumentViewerToolbar.jsx` - Renders the toolbar for the document viewer by delegating to .
- `src/components/DocumentViewer/DocumentViewer.jsx` - Exports DocumentViewer.
- `src/components/DocumentViewer/DocumentViewerThumbnails.jsx` - Exports DocumentViewerThumbnails.
- `src/components/DocumentViewer/CompareZoomOverlay.jsx` - CompareZoomOverlay Presentational-only (no state).

## src/contexts

Files: 4. Lines: 2997. JSDoc symbols: 81.

- `src/contexts/viewerContext.js` - Exports ViewerContext.
- `src/contexts/ViewerProvider.jsx` - Record that a page now has a reusable full-size asset available.
- `src/contexts/themeContext.js` - Create the Theme context with a safe default to avoid undefined access if a consumer is mounted outside the provider by mistake.
- `src/contexts/ThemeProvider.jsx` - ThemeProvider component to manage and provide theme-related state and functions.

## src/ErrorBoundary.jsx

Files: 1. Lines: 297. JSDoc symbols: 12.

- `src/ErrorBoundary.jsx` - Tiny helper to translate with safe fallback (NS: 'common').

## src/hooks

Files: 4. Lines: 650. JSDoc symbols: 23.

- `src/hooks/useNavigationModifierState.js` - Exports useNavigationModifierState.
- `src/hooks/usePageTimer.js` - Custom hook to handle page change with a timer for continuous navigation.
- `src/hooks/usePageNavigation.js` - Custom hook to handle document page navigation with keyboard/mouse.
- `src/hooks/useAcceleratingHoldRepeat.js` - Exports useAcceleratingHoldRepeat.

## src/i18n.js

Files: 1. Lines: 566. JSDoc symbols: 21.

- `src/i18n.js` - Return browser window safely in browser, SSR, test, and documentation contexts.

## src/index.jsx

Files: 1. Lines: 59. JSDoc symbols: 2.

- `src/index.jsx` - Determine environment and set a sensible client-side log level.

## src/integrations

Files: 7. Lines: 2073. JSDoc symbols: 52.

- `src/integrations/parentBridge.js` - Attempt to read a bootstrap object from a same-origin parent.
- `src/integrations/normalizePortableBundle.js` - Normalize many incoming shapes to a neutral PortableDocumentBundle v1.
- `src/integrations/bootstrapRuntime.js` - Canonical bootstrap modes.
- `src/integrations/viewerEvents.js` - Emit a namespaced OpenDocViewer event with an optional detail payload.
- `src/integrations/sessionToken.js` - Decode a Base64 string into a UTF-8 JavaScript string.
- `src/integrations/sessionUrl.js` - Read and fetch a session payload URL from the viewer query string.
- `src/integrations/urlParams.js` - Reads common query params used by the demo and other hosts.

## src/logging

Files: 2. Lines: 740. JSDoc symbols: 46.

- `src/logging/systemLogger.js` - Export a singleton instance (sufficient for app usage).
- `src/logging/userLogger.js` - Export singleton instance.

## src/PerformanceMonitor.jsx

Files: 1. Lines: 1346. JSDoc symbols: 20.

- `src/PerformanceMonitor.jsx` - PerformanceMonitor component.

## src/schemas

Files: 1. Lines: 363. JSDoc symbols: 18.

- `src/schemas/portableBundle.js` - Schema version of this portable bundle definition.

## src/types

Files: 1. Lines: 101. JSDoc symbols: 13.

- `src/types/jsdoc-types.js` - Generic React-like state setter for numbers: accepts either a number or an updater function (number)->number.

## src/utils

Files: 34. Lines: 14530. JSDoc symbols: 562.

- `src/utils/documentLoadingConfig.js` - Count PDF pages in a page descriptor list.
- `src/utils/runtimeConfig.js` - Read the merged runtime configuration from the browser environment.
- `src/utils/viewerPreferences.js` - Persist the user's theme mode preference.
- `src/utils/printPdf.js` - Build a PDF blob from page image URLs and print metadata.
- `src/utils/pdfPrintCacheKey.js` - Compare the content-affecting print settings that determine whether an existing generated PDF can be reused.
- `src/utils/printTemplate.js` - Resolve the configured copy/print-format marker text consistently across print backends.
- `src/utils/supportDiagnostics.js` - Download a JSON diagnostics payload in browser environments.
- `src/utils/documentMetadata.js` - Build a UI-friendly projection of one document's metadata.

## src/workers

Files: 3. Lines: 1549. JSDoc symbols: 3.

- `src/workers/pdfWorker.js` - OpenDocViewer - generated PDF worker.
- `src/workers/imageWorker.js` - Creates an error that tells the caller this worker path is unsupported and should be retried on the main thread.
- `src/workers/pdfPageWorker.js` - Defines createFallbackMainThreadError, getWorkerEnvironmentDiagnostics, serializeError, fitScale, normalizeThumbnailBound.
