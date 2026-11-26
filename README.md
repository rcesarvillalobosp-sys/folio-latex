# Folio

Editor LaTeX en el navegador que **compila todo en tu PC**. Sin cuentas, sin límites de tiempo de compilación, sin servidores externos.

**Documento de presentación (PDF):** [docs/Folio.pdf](docs/Folio.pdf)

## Requisitos

1. **Node.js** (ya lo tienes).
2. **Una distribución LaTeX**. En Windows lo más cómodo es MiKTeX:

   ```bash
   winget install MiKTeX.MiKTeX
   ```

   Después abre **MiKTeX Console → Settings** y en *"Install missing packages on-the-fly"* elige **Always**. Así, cualquier `\usepackage{...}` que no tengas se descarga solo la primera vez que compilas.

   Alternativa: [TeX Live](https://tug.org/texlive/) completo (trae todos los paquetes).
   También funciona con [Tectonic](https://tectonic-typesetting.github.io/) (copia `tectonic.exe` a la carpeta `bin/`).

## Uso

Doble clic en `iniciar.bat`, o:

```bash
npm start
```

y abre <http://localhost:3210>. Los proyectos se guardan como carpetas normales en `projects/` (puedes abrirlos también con cualquier otro editor). Los archivos generados (`.aux`, `.bbl`, `.log`, PDF…) van a `projects/<proyecto>/.out/`.

## Funciones

- **Proyectos**: crear desde plantillas (artículo con BibTeX/natbib, artículo con biblatex+biber APA, informe/tesis con capítulos, beamer, en blanco), renombrar, duplicar, eliminar.
- **Archivos**: árbol de carpetas, crear archivos/carpetas, subir imágenes y archivos (botón o arrastrar y soltar), mover arrastrando a carpetas, renombrar, eliminar, vista previa de imágenes y PDF.
- **Paquetes**: `\usepackage{...}` con autocompletado de los paquetes más usados; los que falten los instala MiKTeX automáticamente. Puedes subir tus propios `.sty`, `.cls`, `.bst` al proyecto.
- **Archivos múltiples**: `\input`, `\include`, `\subfile` (autocompleta los `.tex` del proyecto), `\includegraphics` (autocompleta imágenes, respeta `\graphicspath`).
- **Citas y bibliografía**: BibTeX (`\bibliography` + `\bibliographystyle`, natbib) y biblatex + biber (`\addbibresource`, `\printbibliography`). `\cite{` autocompleta las claves de todos los `.bib` mostrando autor, año y título. En archivos `.bib`, escribe `@` para insertar plantillas de entrada (article, book, inproceedings…). El orden de la bibliografía lo determina el estilo (`plain`/`plainnat` alfabético, `unsrt`/`unsrtnat` por orden de cita, `sorting=nyt` en biblatex…).
- **Referencias cruzadas**: `\ref`, `\eqref`, `\cref`, `\autoref`, `\pageref`… autocompletan todas las `\label` del proyecto.
- **Compilación completa automática**: LaTeX → BibTeX/Biber → makeindex/makeglossaries → LaTeX las veces necesarias hasta que las referencias, índice y bibliografía queden resueltas. Motores: pdfLaTeX, XeLaTeX, LuaLaTeX, Tectonic.
- **Errores y avisos**: lista clicable que salta a la línea exacta, resaltado en el editor y sugerencias (paquete faltante, cita sin definir, etc.). Log completo disponible.
- **Editor**: resaltado LaTeX, autocompletado de comandos y entornos (`\begin{` cierra el entorno solo), cierre de llaves, plegado, buscar/reemplazar, comentar líneas, barra de formato (negrita, cursiva, ecuaciones, figuras, tablas, listas, citas).
- **Esquema** del documento (partes, capítulos, secciones) siguiendo el orden de los `\input`.
- Guardado automático, compilación automática opcional, descargar PDF, abrir la carpeta del proyecto, limpiar auxiliares.

## Atajos

| Atajo | Acción |
|---|---|
| Ctrl+S / Ctrl+Enter | Guardar y compilar |
| Ctrl+Espacio | Autocompletar |
| Ctrl+B / Ctrl+I | Negrita / cursiva |
| Ctrl+/ | Comentar línea |
| Ctrl+F / Ctrl+H | Buscar / reemplazar |
| Ctrl+G | Ir a línea |
| Ctrl+. | Ir a la página del PDF correspondiente (SyncTeX) |

## Seguridad

El servidor solo escucha en `127.0.0.1` (no es accesible desde otros equipos) y compila sin `--shell-escape`. Si necesitas `minted`, añade `-shell-escape` en `server.js` sabiendo que permite ejecutar comandos desde el documento.

---

Autor: **Ricardo Villalobos Perez**
