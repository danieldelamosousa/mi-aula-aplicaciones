# Mi aula · Aplicaciones

Portal educativo autónomo para 2.º ciclo de Primaria (3.º y 4.º) adaptado y mejorado a partir del sitio original, con servidor propio en Node.js sin dependencias externas, registro docente con persistencia local, códigos cortos de sesión y códigos QR.

## Arranque rápido

```bash
node server.js
```

Por defecto se abre en `http://localhost:3000` (puedes cambiar el puerto con `PORT=8080 node server.js`).

## Estructura del proyecto

- `server.js` — Servidor HTTP y API REST sin dependencias externas (persistencia atómica en `data/aula-db.json`).
- `public/index.html` — Portal principal con buscador, filtros por área, favoritas, recientes y acceso por código corto.
- `public/abrir.html` — Selector de modo (*Práctica libre* vs. *Trabajo en el aula*) con filtro por curso, alumnos invitados, código corto y código QR SVG generado en local.
- `public/docente.html` — Panel docente protegido con PIN (PIN inicial: `1234`):
  - Resumen con métricas globales y tabla de sesiones con detalle actividad por actividad.
  - Gestión de la lista de clase (alta individual e importación en lote) e informes por alumno.
  - Control de visibilidad de aplicaciones y alta de recursos externos.
  - Exportación a CSV (compatible con Excel/LibreOffice) e impresión limpia.
- `public/registro.js` — Puente `window.Aula` compatible con todas las aplicaciones integradas, con barra superior de estado, cronómetro activo, contador de aciertos, pantalla completa y cola offline.
- `public/apps/` — Las 8 aplicaciones interactivas integradas, limpias de scripts externos:
  1. `mercadito` — El mercadito
  2. `palabras` — Taller de palabras
  3. `ortografia` — Taller de ortografía
  4. `taller-lengua-u3` — Taller de Lengua U3
  5. `calculadora` — Calculadora bloqueada
  6. `numero-protagonista` — El número protagonista
  7. `taller-multiplicacion` — Taller de multiplicación U3
  8. `penaltis-tablas` — Penaltis de las tablas
