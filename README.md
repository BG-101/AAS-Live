# 🏆 AAS Live

**Software oficial de gestión de torneos de la Asociación Almeriense de Speedcubing.**

AAS Live es una aplicación web full-stack diseñada para gestionar competiciones de speedcubing en tiempo real: desde la inscripción de competidores hasta la generación de rankings, pasando por la gestión de rondas, clasificaciones por grupos de edad, sistemas de puntuación por ligas y, en la versión v1.1.0, un flujo completo de inscripciones con aprobación y rechazo.

---

## Índice

- [Características](#características)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Instalación](#instalación)
- [Variables de entorno](#variables-de-entorno)
- [Inicialización del sistema](#inicialización-del-sistema)
- [Roles y permisos](#roles-y-permisos)
- [Funcionalidades principales](#funcionalidades-principales)
- [API](#api)
- [Seguridad](#seguridad)

---

## Características

- 🏆 **Gestión completa de competiciones** con soporte multidía, límite de aforo y agrupación en series/ligas.
- 📝 **Gestión de inscripciones** con webhook para formularios externos, alta manual por organizador, estados pendient/approved/rejected y aprobación automática de competidores.
- ⚡ **Resultados en tiempo real** mediante WebSockets: los tiempos introducidos por un delegado aparecen al instante en todas las pantallas conectadas sin peticiones GET adicionales.
- 🔢 **Lógica WCA oficial**: cálculo de Ao5, Mo3 y Bo3; desempates por single; soporte para DNF y DNS; cutoffs configurables por ronda; formato heredado automáticamente en rondas sucesivas.
- 🔄 **Sistema multironda**: avance por porcentaje o top fijo, calculado de forma independiente por grupo de edad si la competición lo requiere.
- 🏅 **Sistema SOR** (Sum of Ranks): ranking global por puntos con dos modalidades: SOR clásico y sistema Estilo F1, con penalizaciones diferenciadas para DNF y ausencia.
- 👶 **Separación por grupos de edad**: Alevín (≤10), Infantil (11–15) y Absoluta (≥16), con clasificaciones independientes por categoría.
- 📺 **Modo Proyector**: pantalla de resultados en vivo con scroll automático y animación de podio para finales.
- 🔒 **Seguridad DevSecOps**: JWT en cookies `httpOnly`, RBAC, rate limiting, sanitización de queries MongoDB, registro de auditoría inmutable y protección contra race conditions en la asignación de números de competidor.

---

## Stack tecnológico

| Capa          | Tecnología                                                   |
| ------------- | ------------------------------------------------------------ |
| Frontend      | React 18, Vite, React Router DOM, Tailwind CSS               |
| Backend       | Node.js, Express                                             |
| Base de datos | MongoDB Atlas (Mongoose)                                     |
| Tiempo real   | Socket.IO                                                    |
| Autenticación | JWT + cookies `httpOnly`                                     |
| Seguridad     | Helmet, express-rate-limit, express-mongo-sanitize, bcryptjs |
| HTTP client   | Axios                                                        |

---

## Arquitectura

```
aas-live/
├── server/
│   ├── index.js                  # Punto de entrada: Express + Socket.IO + MongoDB
│   ├── models/
│   │   ├── Competition.js        # Competiciones, rondas y configuración
│   │   ├── Competitor.js         # Competidores, inscripciones y retiradas
│   │   ├── Result.js             # Tiempos, best y average por ronda
│   │   ├── AuditLog.js           # Registro inmutable de cambios de tiempos
│   │   └── User.js               # Usuarios del sistema (roles)
│   ├── routes/
│   │   ├── authRoutes.js         # Login, logout, registro, setup, cierre de proyectores
│   │   ├── competitionRoutes.js  # CRUD de competiciones y gestión de rondas
│   │   ├── competitorRoutes.js   # CRUD de competidores y elegibles por ronda
│   │   ├── registrationRoutes.js # Gestión de inscripciones, webhooks y aprobaciones
│   │   ├── resultRoutes.js       # Guardado y consulta de tiempos
│   │   ├── auditRoutes.js        # Consulta del log de auditoría
│   │   └── sorRoutes.js          # Cálculo de SOR individual y de serie
│   ├── middleware/
│   │   ├── auth.js               # Verificación JWT y control de roles
│   │   └── validateObjectId.js   # Validación de parámetros ObjectId en rutas
│   └── utils/
│       ├── wcaLogic.js           # Lógica WCA: stats, avances, SOR, grupos de edad
│       ├── parseEnvInt.js        # Parseo seguro de enteros positivos desde env vars (con cap de timers)
│       ├── secretStrength.js     # Heurísticas de entropía para SETUP_BOOTSTRAP_TOKEN y DEFAULT_ADMIN_PASSWORD
│       └── validateUsername.js   # Validación de formato de username (setup y registro)
└── client/
    └── src/
        ├── pages/
        │   ├── Home.jsx               # Calendario de competiciones + creación
        │   ├── CompetitionDetails.jsx # Vista principal de gestión de una competición
        │   ├── Projector.jsx          # Pantalla de proyector con scroll y podio
        │   └── SeriesSOR.jsx          # Ranking SOR agregado de una serie
        ├── components/
        │   ├── CompetitionList.jsx       # Lista de competiciones por estado
        │   ├── ResultsTable.jsx          # Tabla de resultados con colores de clasificación
        │   ├── TimeEntryForm.jsx         # Formulario de entrada de tiempos
        │   ├── SORTable.jsx              # Tabla de clasificación SOR
        │   ├── CompetitorEditorModal.jsx # Editor inline de competidores (SuperAdmin)
        │   ├── RegistrationPanel.jsx     # Gestión de inscripciones y webhooks
        │   ├── AuditModal.jsx            # Historial de cambios de tiempos
        │   ├── RoundSettingsModal.jsx    # Configuración de formato y avance por ronda
        │   ├── LoginModal.jsx            # Modal de inicio de sesión
        │   └── RegisterModal.jsx         # Modal de registro de usuarios
        └── utils/
            ├── api.js                # URL base de la API según entorno (dev/prod)
            ├── socket.js             # Factoría de conexión Socket.IO con URL unificada
            ├── formatters.js         # Conversión y formateo de tiempos WCA
            ├── exportCsv.js          # Generación y descarga de CSV de resultados
            └── toast.js              # Sistema de notificaciones toast ligero
```

**Decisiones de diseño relevantes:**

- Toda la lógica matemática WCA (cálculo de promedios, desempates, avances, SOR) reside exclusivamente en `server/utils/wcaLogic.js` y `client/src/utils/formatters.js`. El resto de la app la consume, nunca la reimplementa.
- El estado de autenticación vive únicamente en memoria React, obtenido de `/api/auth/me` al cargar. No hay datos de sesión en `localStorage`. El JWT incluye `id`, `role` y `username`, por lo que `/api/auth/me` resuelve el payload del token sin consultar la base de datos.
- Los WebSockets emiten el payload de resultados ya procesado, no una señal de "recarga". Los clientes actualizan su estado sin GET adicionales.
- La URL de conexión Socket.IO y la URL base de la API REST se derivan de la misma fuente (`client/src/utils/api.js` → `client/src/utils/socket.js`), garantizando que en desarrollo ambas apuntan a `localhost:3001` y en producción al origen del despliegue.
- La asignación del número de competidor usa un bucle de reintentos con detección de error de índice duplicado (`code 11000`) respaldado por un índice único compuesto `{competition, competitorNumber}` en MongoDB, eliminando la posibilidad de race conditions en inscripciones concurrentes.

---

## Instalación

### Requisitos previos

- Node.js 18 o superior
- Una instancia de MongoDB (local o Atlas)

### Pasos

```bash
# 1. Clona el repositorio
git clone https://github.com/BG-101/competiciones-AAS.git
cd competiciones-AAS

# 2. Instala las dependencias del servidor
cd server
npm install

# 3. Instala las dependencias del cliente
cd ../client
npm install

# 4. Configura las variables de entorno (ver sección siguiente)
cd ../server
cp .env.example .env
# Edita .env con tus valores

# 5. Arranca el servidor (desde /server)
npx nodemon index.js

# 6. Arranca el cliente (desde /client, en otra terminal)
npm run dev
```

El servidor corre por defecto en `http://localhost:3001` y el cliente en `http://localhost:5173`.

---

## Variables de entorno

### Servidor — `server/.env`

```env
# Conexión a MongoDB (URI completa con usuario y contraseña)
MONGO_URI=mongodb+srv://<usuario>:<password>@cluster.mongodb.net/<dbname>

# Secreto para firmar los JWT (genera uno con el comando de abajo)
JWT_SECRET=<string_aleatorio_64_bytes>

# Entorno de ejecución
NODE_ENV=development   # o "production"

# URL del cliente (necesaria para CORS en producción)
CLIENT_URL=https://<tu-dominio-frontend>

# Duración de la sesión JWT. Acepta formato jsonwebtoken ("48h", "7d") o un
# número puro interpretado como SEGUNDOS (ej: "3600" = 1 hora).
# Se valida en el arranque: si es inválido, el servidor no arranca.
JWT_EXPIRES_IN=48h

# maxAge de la cookie jwtToken en milisegundos
COOKIE_MAX_AGE_MS=172800000

# Rate limiting de /api/auth/login
RATE_LIMIT_LOGIN_WINDOW_MS=900000
RATE_LIMIT_LOGIN_MAX=10

# Rate limiting de endpoints de escritura (POST/PUT/PATCH/DELETE)
RATE_LIMIT_WRITE_WINDOW_MS=60000
RATE_LIMIT_WRITE_MAX=100

# Límite de tamaño del body JSON
BODY_LIMIT=10kb

# Habilita el endpoint de inicialización del primer SuperAdmin
# Déjalo sin definir o en "false" en producción
ALLOW_SETUP=true

# Token que debe enviarse en el header X-Setup-Token para poder llamar a /api/auth/setup.
# Mínimo 20 caracteres y 8 distintos; se rechazan valores repetitivos/comunes.
SETUP_BOOTSTRAP_TOKEN=<genera-con-el-comando-de-abajo>

# Credenciales del SuperAdmin creado por /api/auth/setup
DEFAULT_ADMIN_USERNAME=admin
# Mínimo 12 caracteres y 6 distintos; se rechazan valores como "admin123" o repetitivos.
DEFAULT_ADMIN_PASSWORD=<define-una-contraseña-fuerte>
```

Para generar un `JWT_SECRET` o `SETUP_BOOTSTRAP_TOKEN` con buena entropía:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Versionado del cliente

La versión mostrada en la interfaz (`vX.Y.Z`, esquina inferior izquierda) se lee de `client/package.json` en tiempo de build vía `vite.config.js` (`__APP_VERSION__`).
Para publicar una nueva versión: actualiza el campo `version` de `client/package.json` antes de ejecutar `npm run build`. No requiere variables de entorno adicionales.

---

## Inicialización del sistema

La primera vez que arranques el servidor necesitas crear el usuario SuperAdmin. El endpoint `/api/auth/setup` exige tres condiciones simultáneas: `ALLOW_SETUP=true`, un `SETUP_BOOTSTRAP_TOKEN` fuerte configurado en el servidor, y ese mismo token enviado en el header de la petición.

1. Asegúrate de que `ALLOW_SETUP=true`, `SETUP_BOOTSTRAP_TOKEN` y `DEFAULT_ADMIN_PASSWORD` (fuertes, no valores triviales tipo `admin123` o repeticiones) están definidos en tu `.env`.
2. Haz una petición POST al endpoint de setup incluyendo el token en el header `X-Setup-Token`:

```bash
curl -X POST http://localhost:3001/api/auth/setup \
    -H "X-Setup-Token: <valor-de-SETUP_BOOTSTRAP_TOKEN>"
```

Esto crea el usuario `DEFAULT_ADMIN_USERNAME` (o `admin` si no se define) con la contraseña de `DEFAULT_ADMIN_PASSWORD`. La respuesta nunca incluye la contraseña en texto plano.

3. Una vez inicializado, elimina `ALLOW_SETUP=true` del `.env` o cámbialo a `false`. El endpoint quedará bloqueado con 403.

**Notas de seguridad:**

- El sistema solo permite un único `SuperAdmin`: un índice único parcial a nivel de MongoDB (`{ role: "SuperAdmin" }`) impide que dos peticiones de setup concurrentes creen administradores duplicados, incluso si ambas superan el chequeo previo en memoria.
- Si `DEFAULT_ADMIN_USERNAME` coincide con un usuario ya existente (no-SuperAdmin), el setup falla con 500 indicando el conflicto, sin confundirlo con "sistema ya inicializado".

---

## Roles y permisos

| Rol          | Descripción                | Permisos                                                                                     |
| ------------ | -------------------------- | -------------------------------------------------------------------------------------------- |
| `SuperAdmin` | Administrador total        | Crear competiciones, gestionar usuarios, editar competidores, vaciar papelera, ver auditoría |
| `Delegado`   | Organizador de competición | Inscribir competidores, introducir tiempos, gestionar rondas, ver auditoría                  |
| `Espectador` | Solo lectura               | Ver resultados en tiempo real, acceder al proyector                                          |

Los usuarios sin sesión iniciada pueden ver la lista de competiciones y los resultados públicos.

---

## Funcionalidades principales

### Competiciones y series

Las competiciones pueden agruparse en **series** (ligas). Los competidores inscritos en una competición de una serie se inscriben automáticamente en todas las demás competiciones de la misma, respetando el límite de aforo de cada una.

### Gestión de inscripciones (v1.1.0)

El sistema incorpora un flujo completo de inscripción para prepararse antes de la competición:

- **Webhook seguro** para recibir solicitudes desde Google Forms o formularios externos.
- **Alta manual** desde el panel de organización para incorporar participantes sin formulario.
- **Estados de inscripción**: pendiente, aprobada o rechazada, con historial de acciones.
- **Aprobación automática** que crea el competidor asociado y respeta el aforo configurado.
- **Rechazo con motivo opcional** para gestionar casos especiales de forma ordenada.

### Gestión de rondas

Cada evento de una competición tiene una o varias rondas configurables con:

- **Formato**: Ao5, Mo3 o Bo3. Las rondas siguientes heredan el formato de la primera.
- **Cutoff**: tiempo límite para completar todos los intentos.
- **Avance**: por porcentaje del total o por top fijo (ej: top 16).

Una ronda debe cerrarse con el candado antes de poder abrir la siguiente. Reabrir una ronda con resultados en rondas posteriores exige confirmación explícita y elimina dichos resultados para mantener la consistencia.

### Sistema SOR

Cuando está activado, genera una clasificación global sumando el rango de cada competidor en cada evento. Dos modalidades:

- **SOR clásico**: menor puntuación = mejor.
- **Estilo F1**: puntos por posición (25-18-15-12-10-8-6-4-2-1), mayor puntuación = mejor.

El SOR puede consultarse por competición individual o de forma agregada para toda la serie desde `/series/:seriesName/sor`.

**Criterios de puntuación por evento (SOR clásico):**

| Situación                        | Puntuación asignada                                         |
| -------------------------------- | ----------------------------------------------------------- |
| Tiempo válido                    | Posición ordinal (1, 2, 3…)                                 |
| DNF / DNS                        | `número de válidos + 1` (se presentó pero no completó)      |
| Ausente del evento o competición | `número total de competidores + 1` (peor que cualquier DNF) |

Este criterio se aplica de forma consistente tanto en el SOR individual como en el SOR de serie, donde los competidores no registrados en una competición reciben la penalización de ausencia equivalente.

### Separación por grupos de edad

Cuando está activada, la clasificación entre rondas es completamente independiente por grupo: el corte se aplica sobre el total de competidores de cada categoría por separado. La tabla de resultados incluye pestañas para filtrar por grupo.

### Modo Proyector

Accesible desde `/projector/:id/:event/:round`. Diseñado para mostrarse en un monitor o proyector durante la competición:

- **Modo Lista**: tabla de resultados con scroll automático continuo.
- **Modo Podio**: animación de aparición de los top 3 al cerrar una ronda final.

Alterna automáticamente entre ambos modos. Actualización en tiempo real por WebSocket. El enlace al proyector se oculta automáticamente cuando la vista activa es el SOR.

### Retiradas de ronda

Los admins pueden marcar a un competidor clasificado como retirado de la siguiente ronda. El slot de clasificación se transfiere automáticamente al siguiente competidor en el ranking WCA.

### Detección de tiempos anómalos

Al guardar resultados, el sistema detecta tiempos que superan 3 veces la mediana del resto de intentos válidos y solicita confirmación explícita al delegado antes de guardar.

---

## API

Todos los endpoints protegidos requieren una cookie `jwtToken` válida.

| Método | Endpoint                                          | Auth           | Descripción                                      |
| ------ | ------------------------------------------------- | -------------- | ------------------------------------------------ |
| POST   | `/api/auth/login`                                 | —              | Inicia sesión                                    |
| GET    | `/api/auth/me`                                    | ✅             | Verifica sesión activa (resuelto desde el token) |
| POST   | `/api/auth/logout`                                | —              | Cierra sesión                                    |
| POST   | `/api/auth/register`                              | SuperAdmin     | Crea un nuevo usuario                            |
| POST   | `/api/auth/setup`                                 | —              | Inicialización (requiere `ALLOW_SETUP=true`)     |
| POST   | `/api/auth/logout-projectors`                     | Admin/Delegado | Fuerza cierre de sesión en pantallas Espectador  |
| GET    | `/api/competitions`                               | —              | Lista todas las competiciones activas            |
| GET    | `/api/competitions/:id`                           | —              | Detalle de una competición                       |
| POST   | `/api/competitions`                               | SuperAdmin     | Crea una competición                             |
| DELETE | `/api/competitions/:id`                           | SuperAdmin     | Soft delete de una competición                   |
| POST   | `/api/competitions/:id/next-round`                | Admin/Delegado | Abre la siguiente ronda                          |
| PUT    | `/api/competitions/:id/round-settings`            | Admin/Delegado | Actualiza configuración de ronda                 |
| PUT    | `/api/competitions/:id/round-status`              | Admin/Delegado | Abre o cierra una ronda                          |
| DELETE | `/api/competitions/:id/round-results-after`       | Admin/Delegado | Elimina resultados de rondas posteriores a una   |
| GET    | `/api/competitors/:compId`                        | —              | Lista competidores de una competición            |
| GET    | `/api/competitors/:compId/eligible/:event/:round` | —              | Competidores elegibles para una ronda            |
| POST   | `/api/competitors`                                | Admin/Delegado | Inscribe un competidor                           |
| PUT    | `/api/competitors/:id`                            | SuperAdmin     | Edita los datos de un competidor                 |
| DELETE | `/api/competitors/:id`                            | Admin/Delegado | Soft delete de un competidor                     |
| DELETE | `/api/competitors/empty-trash/:compId`            | SuperAdmin     | Vacía la papelera de una competición             |
| PATCH  | `/api/competitors/:id/withdraw`                   | Admin/Delegado | Marca o desmarca una retirada de ronda           |
| GET    | `/api/registrations/:compId`                      | Admin/Delegado | Lista las inscripciones de una competición       |
| POST   | `/api/registrations/webhook/:compId`              | —              | Recibe inscripciones desde un formulario externo |
| POST   | `/api/registrations/manual/:compId`               | Admin/Delegado | Crea una inscripción manualmente                 |
| POST   | `/api/registrations/:compId/generate-secret`      | SuperAdmin     | Genera o regenera el secreto del webhook         |
| PATCH  | `/api/registrations/:id/approve`                  | Admin/Delegado | Aprueba una inscripción y crea el competidor     |
| PATCH  | `/api/registrations/:id/reject`                   | Admin/Delegado | Rechaza una inscripción con motivo opcional      |
| DELETE | `/api/registrations/:id`                          | SuperAdmin     | Elimina físicamente una inscripción              |
| GET    | `/api/results/:compId/:event/:round`              | —              | Resultados de una ronda                          |
| POST   | `/api/results`                                    | Admin/Delegado | Guarda los tiempos de un competidor              |
| GET    | `/api/audit/:compId`                              | Admin/Delegado | Log de auditoría de una competición              |
| GET    | `/api/sor/:compId`                                | —              | Ranking SOR de una competición                   |
| GET    | `/api/sor/series/:seriesName`                     | —              | Ranking SOR agregado de una serie                |

---

## Seguridad

- **Autenticación**: JWT firmado almacenado en cookie `httpOnly`, inaccesible desde JavaScript del cliente. El payload incluye `id`, `role` y `username`, eliminando la necesidad de consultar la base de datos en cada verificación de sesión.
- **Autorización**: middleware `auth(roles[])` en todos los endpoints que lo requieren.
- **Rate limiting**: máximo 10 intentos de login cada 15 minutos; máximo 100 peticiones de escritura por minuto en el resto de endpoints.
- **Sanitización**: `express-mongo-sanitize` previene inyecciones de operadores MongoDB.
- **Cabeceras HTTP**: `helmet` configura cabeceras de seguridad estándar.
- **Validación de IDs**: middleware `validateObjectId` en todas las rutas con parámetros ObjectId; validación manual en endpoints con IDs en el body, devolviendo 400 en lugar de un CastError 500 de Mongoose.
- **Soft delete**: los competidores y competiciones borrados no se eliminan físicamente, se marcan con `isDeleted: true` y se renombran para liberar índices únicos.
- **Integridad de numeración**: índice único compuesto `{competition, competitorNumber}` en el modelo `Competitor`, combinado con un bucle de reintentos en la inscripción, previene duplicados de número de competidor bajo carga concurrente.
- **Auditoría**: cada modificación de tiempos queda registrada en `AuditLog` con el estado anterior y el nuevo, accesible solo para admins.
- **Endpoint de bootstrap protegido**: `/api/auth/setup` requiere un token dedicado (`SETUP_BOOTSTRAP_TOKEN`, comparado con `crypto.timingSafeEqual`) además de `ALLOW_SETUP=true`; el token y la contraseña por defecto se validan por entropía (longitud mínima, diversidad de caracteres, denylist de valores comunes) antes de poder crear el primer SuperAdmin.
- **Configuración externalizada**: rate limits (login y escritura), duración del JWT, `maxAge` de la cookie y límite del body JSON se leen de variables de entorno con parseo seguro (`parsePositiveInt`), evitando valores negativos, `NaN` o superiores al límite de timers de Node.

---

_Desarrollado para la Asociación Almeriense de Speedcubing._

---

## Licencia

Este proyecto está bajo Licencia MIT Modificada con Atribución Obligatoria. Puedes usar, modificar y distribuir el código, incluso en versiones personalizadas para otros clubes o eventos, siempre que mantengas la mención a **AAS Live** y a su creador, **Marco Criado Gómez**. Ver [LICENSE](./LICENSE.txt) para el texto completo.
