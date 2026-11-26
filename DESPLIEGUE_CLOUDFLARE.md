# Cómo publicar «Mi aula · Aplicaciones» gratis en Cloudflare Pages + D1

Esta guía te permite publicar la web completa (las **8 aplicaciones**, **códigos cortos + QR** y el **Panel docente sincronizado entre dispositivos**) **100 % gratis, sin tarjeta de crédito y sin que se duerma nunca**.

> **Ventaja importante:** la base de datos se inicializa **automáticamente** en la primera visita. No necesitas ejecutar comandos ni escribir SQL a mano.

---

## Paso 1 · Sube la carpeta `mi-aula` a GitHub

1. Crea una cuenta gratuita en [github.com](https://github.com) (si no tienes una).
2. Pulsa **New repository** (arriba a la derecha, icono `+`):
   - Nombre: `mi-aula-aplicaciones`
   - Visibilidad: **Private** (recomendado) o **Public**.
   - Pulsa **Create repository**.
3. Sube el contenido de la carpeta `mi-aula/` a ese repositorio (puedes usar *uploading an existing file* desde la propia web de GitHub o `git push` desde tu ordenador).
   - Asegúrate de que en la raíz del repositorio estén las carpetas `public/` y `functions/` (además de `schema.sql`).

---

## Paso 2 · Crea la base de datos D1 en Cloudflare

1. Crea una cuenta gratuita en [dash.cloudflare.com](https://dash.cloudflare.com) (no pide tarjeta).
2. En el menú izquierdo entra en **Storage & Databases → D1 SQL Database**.
3. Pulsa **Create**:
   - **Database name:** `mi-aula-db`
   - **Location:** *Western Europe (WEUR)* (la más rápida para España).
   - Pulsa **Create**.

*(No hace falta crear tablas manualmente: la web las crea y carga las 8 aplicaciones automáticamente la primera vez que la abras.)*

---

## Paso 3 · Publica el sitio con Cloudflare Pages

1. En el menú izquierdo entra en **Compute (Workers) → Workers & Pages**.
2. Pulsa **Create → Pages → Connect to Git**.
3. Autoriza GitHub y selecciona tu repositorio `mi-aula-aplicaciones`.
4. En **Set up builds and deployments**, rellena exactamente esto:
   - **Framework preset:** `None`
   - **Build command:** *(déjalo vacío)*
   - **Build output directory:** `public`
5. Pulsa **Save and Deploy**. En menos de 1 minuto te dará tu dirección gratuita (por ejemplo `https://mi-aula-aplicaciones.pages.dev`).

---

## Paso 4 · Conecta la base de datos D1 a tu web (solo se hace una vez)

1. Dentro de tu proyecto en Cloudflare Pages, entra en **Settings → Bindings** (o **Functions → D1 database bindings**).
2. Pulsa **Add → D1 database**:
   - **Variable name:** `DB` *(exactamente en mayúsculas)*
   - **D1 database:** selecciona `mi-aula-db`
3. Pulsa **Save**.
4. Ve a **Deployments**, pulsa en los tres puntos (`⋯`) del último despliegue y elige **Retry deployment** para que el enlace `DB` quede activo.

---

## ¡Listo! Primer uso en el aula

1. Abre tu nueva URL (`https://mi-aula-aplicaciones.pages.dev`).
2. Entra en **Panel docente** (arriba a la derecha) con el PIN inicial **`1234`**.
3. En **Ajustes**, cambia el PIN por uno tuyo y personaliza el nombre del aula si quieres.
4. En **Alumnado**, pega tu lista real de clase con la opción *Importar lista completa*.
5. Ya puedes abrir cualquier actividad en modo **Trabajo en el aula**, proyectar el **código corto o el QR** en la pizarra digital y ver los resultados llegar en tiempo real desde las tablets del alumnado.

---

## Paso 5 · Seguridad recomendada para uso real en el centro

1. **Doble capa en el Panel docente con Cloudflare Access (Zero Trust, gratis hasta 50 usuarios):**
   - Entra en **Zero Trust → Access → Applications → Add an application → Self-hosted**.
   - Crea una aplicación para tu dominio `mi-aula-aplicaciones.pages.dev` con dos rutas protegidas:
     - `/docente`
     - `/api/teacher/*`
   - En **Policy**, añade una regla **Allow** con **Include → Emails** y escribe tu correo personal/docente.
   - Guarda: a partir de ese momento el panel pedirá **inicio de sesión con tu correo (código OTP o Google) + tu PIN docente**. Además, puedes escribir ese mismo correo en **Panel docente → Ajustes → Correo Cloudflare Access**.
2. **Privacidad de la lista de clase («Clave de aula»):**
   - En **Panel docente → Ajustes**, configura una **Clave de aula** y activa *«Pedir Clave de aula para ver la lista de clase»*. Así los nombres del alumnado no son visibles para visitantes externos, pero las tablets del colegio la recuerdan durante 30 días (y el alumnado con código corto o QR entra directamente).
   - Opcionalmente, desactiva *«Permitir participantes invitados»* para que solo se registren sesiones de tu lista oficial.
3. **Evita despliegues duplicados en Workers:**
   - Este proyecto está diseñado para **Cloudflare Pages** (con carpeta `functions/`). Si ves también un servicio llamado `mi-aula-aplicaciones` en **Compute (Workers)**, elimínalo para quedarte solo con el proyecto de **Pages**.

