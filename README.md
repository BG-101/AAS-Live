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
- [Principio de mínimo privilegio](#principio-de-mínimo-privilegio)
- [Inicialización del sistema](#inicialización-del-sistema)
- [Roles y permisos](#roles-y-permisos)
- [Funcionalidades principales](#funcionalidades-principales)
- [API](#api)
- [Seguridad](#seguridad)
- [Tests](#tests)
- [Despliegue con Docker](#despliegue-con-docker)

---

## Características

- 🏆 **Gestión completa de competiciones** con soporte multidía, límite de aforo y agrupación en series/ligas.
- 📝 **Gestión de inscripciones** con webhook para formularios externos, alta manual por organizador, estados pendient/approved/rejected y aprobación automática de competidores.
- ⚡ **Resultados en tiempo real** mediante WebSockets: los tiempos introducidos por un delegado aparecen al instante en todas las pantallas conectadas sin peticiones GET adicionales.
- 🔢 **Lógica WCA oficial**: cálculo de Ao5, Mo3, Bo3 y Bo5 (BLD); desempates por single; soporte para DNF y DNS; cutoffs configurables por ronda; formato heredado automáticamente en rondas sucesivas.
- 🔄 **Sistema multironda**: avance por porcentaje o top fijo, calculado de forma independiente por grupo de edad si la competición lo requiere.
- 🏅 **Sistema SOR** (Sum of Ranks): ranking global por puntos con dos modalidades: SOR clásico y sistema Estilo F1, con penalizaciones diferenciadas para DNF y ausencia.
- 👶 **Separación por grupos de edad**: Alevín (≤10), Infantil (11–15) y Absoluta (≥16), con clasificaciones independientes por categoría.
- 📺 **Modo Proyector**: pantalla de resultados en vivo con scroll automático y animación de podio para finales.
- 🔒 **Seguridad DevSecOps**: JWT en cookies `httpOnly`, RBAC, rate limiting, sanitización de queries MongoDB, registro de auditoría inmutable y protección contra race conditions en la asignación de números de competidor.
- ⌛ **Ventana de edición por rol**: los Delegados solo pueden modificar tiempos, competidores y rondas hasta `DELEGATE_EDIT_WINDOW_DAYS` días después de la fecha de fin de la competición; pasado ese plazo, solo un SuperAdmin puede tocarla. Evita modificaciones accidentales o maliciosas sobre torneos ya cerrados.
- 🔐 **Webhook de inscripciones con caducidad**: el formulario externo deja de aceptar repuestas automáticamente el mismo día en que empieza la competición, y no se puede regenerar el secreto pasada esa fecha.
- 🐳 **Despliegue containerizado**: imágenes Docker sin privilegios (usuario no-root) publicadas en GHCR en cada release de GitHub (excluyendo pre-release), con actualización manual mediante pull explícito de las imágenes.

---

## Stack tecnológico

| Capa          | Tecnología                                                   |
| ------------- | ------------------------------------------------------------ |
| Frontend      | React 18, Vite, React Router DOM, Tailwind CSS               |
| Backend       | Node.js, Express                                             |
| Base de datos | MongoDB (Atlas o self-hosted, requiere Replica Set)          |
| Tiempo real   | Socket.IO                                                    |
| Autenticación | JWT + cookies `httpOnly`                                     |
| Seguridad     | Helmet, express-rate-limit, express-mongo-sanitize, bcryptjs |
| Logging       | Pino (structured logging)                                    |
| HTTP client   | Axios                                                        |
| Despliegue    | Docker, GitHub Actions                                       |

---

## Arquitectura

```
aas-live/
├── server/
│   ├── index.js                  # Punto de entrada: Express + Socket.IO, arranque tras conexión a BD
│   ├── config/
│   │   └── db.js                 # Conexión a MongoDB desacoplada (Atlas o self-hosted/on-premise)
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
│   │   ├── registrationRoutes.js # Inscripciones, webhook con caducidad y aprobaciones
│   │   ├── resultRoutes.js       # Guardado y consulta de tiempos
│   │   ├── auditRoutes.js        # Consulta del log de auditoría
│   │   └── sorRoutes.js          # Cálculo de SOR individual y de serie
│   ├── middleware/
│   │   ├── auth.js               # Verificación JWT y control de roles
│   │   ├── editWindow.js         # Bloquea mutaciones de Delegados fuera de la ventana de edición
│   │   └── validateObjectId.js   # Validación de parámetros ObjectId en rutas
│   └── utils/
│       ├── wcaLogic.js           # Lógica WCA: stats, avances, SOR, grupos de edad
│       ├── dateHelpers.js        # Cálculo de días transcurridos inmune a DST (UTC-only)
│       ├── parseEnvInt.js        # Parseo seguro de enteros positivos desde env vars
│       ├── secretStrength.js     # Heurísticas de entropía para tokens/contraseñas de bootstrap
│       ├── errorResponse.js      # Respuestas 500 genéricas en producción, detalladas en dev/test
│       ├── logger.js             # Logger estructurado (Pino)
│       └── validateUsername.js   # Validación de formato de username
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
        │   ├── UserPanel.jsx             # Listado de usuarios y reseteo de contraseña (SuperAdmin)
        │   ├── LoginModal.jsx            # Modal de inicio de sesión
        │   └── RegisterModal.jsx         # Modal de registro de usuarios
        └── utils/
            ├── api.js                # URL base de la API según entorno (dev/prod)
            ├── socket.js             # Factoría de conexión Socket.IO con URL unificada
            ├── formatters.js         # Conversión y formateo de tiempos WCA (incluye Bo5)
            ├── exportCsv.js          # Generación y descarga de CSV de resultados
            └── toast.js              # Sistema de notificaciones toast ligero
```

**Decisiones de diseño relevantes:**

- Toda la lógica matemática WCA (cálculo de promedios, desempates, avances, SOR) reside exclusivamente en `server/utils/wcaLogic.js` y `client/src/utils/formatters.js`. El resto de la app la consume, nunca la reimplementa.
- El estado de autenticación vive únicamente en memoria React, obtenido de `/api/auth/me` al cargar. No hay datos de sesión en `localStorage`. El JWT incluye `id`, `role` y `username`, por lo que `/api/auth/me` resuelve el payload del token sin consultar la base de datos.
- Los WebSockets emiten el payload de resultados ya procesado, no una señal de "recarga". Los clientes actualizan su estado sin GET adicionales.
- La URL de conexión Socket.IO y la URL base de la API REST se derivan de la misma fuente (`client/src/utils/api.js` → `client/src/utils/socket.js`), garantizando que en desarrollo ambas apuntan a `localhost:3001` y en producción al origen del despliegue.
- La asignación del número de competidor usa un bucle de reintentos con detección de error de índice duplicado (`code 11000`) respaldado por un índice único compuesto `{competition, competitorNumber}` en MongoDB, eliminando la posibilidad de race conditions en inscripciones concurrentes.
- El cálculo de SOR (`calculateSOR`) usa una caché en memoria con TTL de 2.5s por `(competición, grupo de edad)`, invalidada explícitamente en cada mutación relevante (resultados, altas/bajas de competidor, cambios de estado de ronda, aprobación de inscripciones) - incluyendo las competiciones espejo de una misma serie. Evita recomputar SOR completa en cada emisión de socket cuando varios clientes consultan la misma competición o serie simultánemante.

---

## Instalación

### Requisitos previos

- Node.js 18 o superior
- Una instancia de MongoDB configurada como **Replica Set** (incluso de un único nodo). Es obligatorio: el sistema usa transacciones multi-documento (`mongoose.startSession()` / `withTransaction()`) al guardar resultados y al aprobar inscricpiones, y MongoDB solo soporta transacciones sobre un replica set.

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
# Debe apuntar a un MongoDB en modo Replica Set (Atlas ya lo es por defecto;
# en local, inicializa con --replSet aunque sea un único nodo)
MONGO_URI=mongodb+srv://<usuario>:<password>@cluster.mongodb.net/<dbname>

# Opcionales, solo relevantes para MongoDB self-hosted/on-premise.
# Descomenta y ajusta SOLO si tu despliegue lo requiere; en Atlas no se usan.
# MONGO_TLS_CA_FILE=/ruta/al/ca.pem
# MONGO_AUTH_SOURCE=admin
# MONGO_REPLICA_SET=rs0

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

# Días tras el endDate durante los cuales un Delegado aún puede editar
# (tiempos, competidores, rondas, aprobar/rechazar inscripciones).
# Pasados ese plazo, solo un SuperAdmin puede modificar la competición.
DELEGATE_EDIT_WINDOW_DAYS=2

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

## Principio de mínimo privilegio

El usuario de MongoDB usado para el schema inicial (`root`/admin) **no debe** ser el usuario de la aplicación en producción. Tras el primer arranque, crea un usuario dedicado con permisos limitados a la base de datos del proyecto:

```bash
mongosh "<MONGO_URI_ROOT>" --eval '
use aas-live
db.createUser({
    user: "aas_live_app",
    pwd: "<password-fuert-generada>",
    roles: [{ role: "readWrite", db: "aas-live" }]
})
'
```

Después, `MONGO_URI` en `.env` debe apuntar a `aas_live_app`, nunca a las credenciales root/admin.

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

| Rol           | Descripción                | Permisos                                                                                                                                                                                     |
| ------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SuperAdmin`  | Administrador total        | Crear competiciones, gestionar usuarios (incluye reseteo de contraseñas), editar competidores, vaciar papelera, ver auditoría, editar competición sin límite temporal                        |
| `Delegado`    | Organizador de competición | Inscribir competidores, introducir tiempos, gestionar rondas, ver auditoría - solo hasta `DELEGATE_EDIT_WINDOW_DAYS` días tras el fin de la competición, y nunca antes de la fecha de inicio |
| `Espectador`  | Solo lectura               | Ver resultados en tiempo real, acceder al proyector                                                                                                                                          |
| `Metetiempos` | Solo entrada de tiempos    | Introducir tiempos de la ronda activa. Sin acceso a gestión de competidores, rondas, inscripciones ni auditoría                                                                              |

Los usuarios sin sesión iniciada pueden ver la lista de competiciones y los resultados públicos.

---

## Funcionalidades principales

### Competiciones y series

Las competiciones pueden agruparse en **series** (ligas). Al inscribir un competidor en una competición de una serie, se replica automáticamente en el resto de competiciones de esa serie, respetando el límite de aforo de cada una. El comportamiento varía según la vía de inscripción:

- **Alta directa** (`POST /api/competitors`): se refleja en todas las competiciones activas en la serie, copiando la lista de eventos tal cual se envió.
- **Aprobación de inscripción** (`PATCH /api/registrations/:id/approve`): se refleja solo en competiciones de la serie **aún no finalizadas** (`endDate` >= fecha actual), y únicamente con los eventos en **común** entre la inscripción original y cada competición destino. La comprobación de aforo/duplicado y la inserción son atómicas por competición destino (transacción de Mongo), de forma que aprobaciones concurrentes de la misma persona en distintas competiciones de la serie no exceden el aforo ni dupliquen el registro.

### Gestión de inscripciones

El sistema incorpora un flujo completo de inscripción para prepararse antes de la competición:

- **Webhook seguro** para recibir solicitudes desde Google Forms o formularios externos. La plantilla de Apps Script (generada desde el panel de inscripciones) se vincula a la **hoja de respuestas**, no al formulario - el evento del trigger expone `namedValues`/`range`, no `response`; usar la plantilla generada por la app evita el error `e.response is undefined` de scripts vinculados incorrectamente.
- **Alta manual** desde el panel de organización para incorporar participantes sin formulario.
- **Estados de inscripción**: pendiente, aprobada o rechazada, con historial de acciones.
- **Aprobación automática** que crea el competidor asociado, respeta el aforo configurado y lo replica en las competiciones activas de la serie (si aplica).
- **Rechazo con motivo opcional** para gestionar casos especiales de forma ordenada.
- **Caducidad automática**: el webhook deja de aceptar respuestas y no puede regenerarse el secreto una vez alcanzada la fecha de inicio (`startDate`) de la competición.

### Gestión de rondas

Cada evento de una competición tiene una o varias rondas configurables con:

- **Formato**: Ao5, Mo3, Bo3 o Bo5 (este último pensado para 3x3 BLD según el formato WCA actualizado). Las rondas siguientes heredan el formato de la primera.
- **Cutoff**: tiempo límite para completar todos los intentos. Los intentos bloqueados por no superar el cutoff se registran como DNF, nunca como intento vacío.
- **Avance**: por porcentaje del total o por top fijo (ej: top 16).

Una ronda debe cerrarse con el candado antes de poder abrir la siguiente, y **no puede cerrarse una ronda si la anterior no está ya cerrada**. Los intentos no pueden guardarse en una ronda cerrada (Finished); hay que reabrirla primero.

Reabrir una ronda con resultados en rondas posteriores exige confirmación explícita, elimina dichos resultados y **reabre automáticamente cualquier ronda posterior que estuviera cerrada**, dejando el estado siempre consistente con los datos reales disponibles. Este borrado y la reapertura se ejecutan como una única transacción de MongoDB.

### Sistema SOR

Cuando está activado, genera una clasificación global sumando el rango de cada competidor en cada evento. Dos modalidades:

- **SOR clásico**: menor puntuación = mejor.
- **Estilo F1**: puntos por posición (25-18-15-12-10-8-6-4-2-1), mayor puntuación = mejor.

El SOR puede consultarse por competición individual o de forma agregada para toda la serie desde `/series/:seriesName/sor`.
El cálculo se cachea en memoria (TTL 2.5s) por competición y grupo de edad, para no recalcular en cada actualización de resultados cuando hay varios espectadores conectados a la vez.

**Criterios de puntuación por evento (SOR clásico):**

| Situación                        | Puntuación asignada                                         |
| -------------------------------- | ----------------------------------------------------------- |
| Tiempo válido                    | Posición ordinal (1, 2, 3…)                                 |
| DNF / DNS                        | `número de válidos + 1` (se presentó pero no completó)      |
| Ausente del evento o competición | `número total de competidores + 1` (peor que cualquier DNF) |

Este criterio se aplica de forma consistente tanto en el SOR individual como en el SOR de serie, donde los competidores no registrados en una competición reciben la penalización de ausencia equivalente.

### Separación por grupos de edad

Cuando está activada, la clasificación entre rondas es completamente independiente por grupo: el corte se aplica sobre el total de competidores de cada categoría por separado. La tabla de resultados incluye pestañas para filtrar por grupo, ordenadas automáticamente de menor a mayor edad. En la tabla SOR, mientras la ronda del evento no esté cerrada, se muestra un aviso de que los puntos por grupo de edad son provisionales.

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

| Método | Endpoint                                          | Auth           | Descripción                                                                                                          |
| ------ | ------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/login`                                 | —              | Inicia sesión                                                                                                        |
| GET    | `/api/auth/me`                                    | ✅             | Verifica sesión activa (resuelto desde el token)                                                                     |
| POST   | `/api/auth/logout`                                | —              | Cierra sesión                                                                                                        |
| POST   | `/api/auth/register`                              | SuperAdmin     | Crea un nuevo usuario                                                                                                |
| POST   | `/api/auth/setup`                                 | —              | Inicialización (requiere `ALLOW_SETUP=true`)                                                                         |
| POST   | `/api/auth/logout-projectors`                     | Admin/Delegado | Fuerza cierre de sesión en pantallas Espectador                                                                      |
| GET    | `/api/auth/users`                                 | SuperAdmin     | Lista usuarios (username + rol, sin contraseña)                                                                      |
| GET    | `/api/auth/users/:id/reset-password`              | SuperAdmin     | Resetea contraseña de un usuario (custom o generada) e invalida sus sesiones activas                                 |
| GET    | `/api/competitions`                               | —              | Lista todas las competiciones activas                                                                                |
| GET    | `/api/competitions/:id`                           | —              | Detalle de una competición                                                                                           |
| POST   | `/api/competitions`                               | SuperAdmin     | Crea una competición                                                                                                 |
| DELETE | `/api/competitions/:id`                           | SuperAdmin     | Soft delete de una competición                                                                                       |
| POST   | `/api/competitions/:id/next-round`                | Admin/Delegado | Abre la siguiente ronda                                                                                              |
| PUT    | `/api/competitions/:id/round-settings`            | Admin/Delegado | Actualiza configuración de ronda                                                                                     |
| PUT    | `/api/competitions/:id/round-status`              | Admin/Delegado | Abre o cierra una ronda                                                                                              |
| DELETE | `/api/competitions/:id/round-results-after`       | Admin/Delegado | Elimina resultados de rondas posteriores a una                                                                       |
| GET    | `/api/competitors/:compId`                        | —              | Lista competidores de una competición                                                                                |
| GET    | `/api/competitors/:compId/eligible/:event/:round` | —              | Competidores elegibles para una ronda                                                                                |
| POST   | `/api/competitors`                                | Admin/Delegado | Inscribe un competidor                                                                                               |
| PUT    | `/api/competitors/:id`                            | SuperAdmin     | Edita los datos de un competidor                                                                                     |
| DELETE | `/api/competitors/:id`                            | Admin/Delegado | Soft delete de un competidor                                                                                         |
| DELETE | `/api/competitors/empty-trash/:compId`            | SuperAdmin     | Vacía la papelera de una competición                                                                                 |
| PATCH  | `/api/competitors/:id/withdraw`                   | Admin/Delegado | Marca o desmarca una retirada de ronda                                                                               |
| GET    | `/api/registrations/:compId`                      | Admin/Delegado | Lista las inscripciones de una competición                                                                           |
| POST   | `/api/registrations/webhook/:compId`              | —              | Recibe inscripciones desde un formulario externo                                                                     |
| POST   | `/api/registrations/manual/:compId`               | Admin/Delegado | Crea una inscripción manualmente                                                                                     |
| POST   | `/api/registrations/:compId/generate-secret`      | SuperAdmin     | Genera o regenera el secreto del webhook                                                                             |
| PATCH  | `/api/registrations/:id/approve`                  | Admin/Delegado | Aprueba una inscripción, crea el competidor y lo replica en la serie (competiciones no finalizada, eventos en común) |
| PATCH  | `/api/registrations/:id/reject`                   | Admin/Delegado | Rechaza una inscripción con motivo opcional                                                                          |
| DELETE | `/api/registrations/:id`                          | SuperAdmin     | Elimina físicamente una inscripción                                                                                  |
| GET    | `/api/results/:compId/:event/:round`              | —              | Resultados de una ronda                                                                                              |
| POST   | `/api/results`                                    | Admin/Delegado | Guarda los tiempos de un competidor                                                                                  |
| GET    | `/api/audit/:compId`                              | Admin/Delegado | Log de auditoría de una competición                                                                                  |
| GET    | `/api/sor/:compId`                                | —              | Ranking SOR de una competición                                                                                       |
| GET    | `/api/sor/series/:seriesName`                     | —              | Ranking SOR agregado de una serie (409 si las competiciones de la serie mezclan sistemas de puntuación SOR/F1)       |

---

## Seguridad

- **Autenticación**: JWT firmado almacenado en cookie `httpOnly`, inaccesible desde JavaScript del cliente. El payload incluye `id`, `role` y `username`, eliminando la necesidad de consultar la base de datos en cada verificación de sesión.
- **Autorización**: middleware `auth(roles[])` en todos los endpoints que lo requieren.
- **Rate limiting**: máximo 10 intentos de login cada 15 minutos; máximo 100 peticiones de escritura por minuto en el resto de endpoints.
- **Sanitización**: `express-mongo-sanitize` previene inyecciones de operadores MongoDB.
- **Cabeceras HTTP**: `helmet` configura cabeceras de seguridad estándar.
- **Validación de IDs**: middleware `validateObjectId` en todas las rutas con parámetros ObjectId; validación manual en endpoints con IDs en el body, devolviendo 400 en lugar de un CastError 500 de Mongoose.
- **Validación de estado de ronda**: `PUT /api/competitions/:id/round-status` solo acepta `"In Progress"` o `"Finished"`; cualquier otro valor se rechaza con 400 antes de tocar la base de datos, evitando estados no reconocidos que romperían el cálculo de SOR y las validaciones de avance secuencial entre rondas.
- **Soft delete**: los competidores y competiciones borrados no se eliminan físicamente, se marcan con `isDeleted: true` y se renombran para liberar índices únicos.
- **Integridad de numeración**: índice único compuesto `{competition, competitorNumber}` en el modelo `Competitor`, combinado con un bucle de reintentos en la inscripción, previene duplicados de número de competidor bajo carga concurrente.
- **Auditoría**: cada modificación de tiempos queda registrada en `AuditLog` con el estado anterior y el nuevo, accesible solo para admins.
- **Endpoint de bootstrap protegido**: `/api/auth/setup` requiere un token dedicado (`SETUP_BOOTSTRAP_TOKEN`, comparado con `crypto.timingSafeEqual`) además de `ALLOW_SETUP=true`; el token y la contraseña por defecto se validan por entropía (longitud mínima, diversidad de caracteres, denylist de valores comunes) antes de poder crear el primer SuperAdmin.
- **Configuración externalizada**: rate limits (login y escritura), duración del JWT, `maxAge` de la cookie y límite del body JSON se leen de variables de entorno con parseo seguro (`parsePositiveInt`), evitando valores negativos, `NaN` o superiores al límite de timers de Node.
- **Ventana de edición temporal**: middleware `editWindowGuard` bloquea con 403 cualquier mutación de un Delegado (tiempos, competidores, rondas, aprobación de inscripciones, incluida la auto-inscripción en competiciones de serie) sobre competiciones finalizadas hace más de `DELEGATE_EDIT_WINDOW_DAYS` días. SuperAdmin no tiene esta restricción.
- **Ventana de entrada de tiempos**: nadie salvo SuperAdmin puede introducir tiempos antes de la fecha de inicio (`startDate`) de la competición, con el mismo criterio de comparación por día calendario UTC usado en la ventana de edición posterior.
- **Revocación de sesión (`tokenVersion`)**: cada usuario lleva un contador `tokenVersion` en BD, incluido en el payload del JWT al hacer login. Un reseteo de contraseña desde el panel de SuperAdmin lo incrementa, invalidando inmediatamente cualquier sesión activa emitida antes del reset - un token robado deja de servir en cuanto se cambia la contraseña de esa cuenta, sin esperar a su expiración natural.
- **Mensajes de error controlados**: en producción, los errores 500 devuelven un mensaje genérico al cliente; el detalle real solo se expone en `development`/`test` o en errores 4xx de validación. Todo se registra internamente con logging estructurado (Pino).
- **Contenedores sin privilegios**: las imágenes Docker del servidor y del cliente corren como usuario no-root.
- **CI/pre-commit**: un job de GitHub Actions y un hook local bloquean cualquier commit que incluya un archivo `.env` real (incluyendo renombrados), evitando fugas accidentales de secretos.

---

## Tests

```bash
cd server
npm test
```

Suite en Jest + Supertest, con `MongoMemoryReplSet` (no `MongoMemoryServer` - las transacciones multi-documento usadas al guardar resultados y aprobar inscripciones requieren un replica set) instanciado por fichero. Se ejecuta en serie (`--runInBand`) porque varios replica sets en memoria en paralelo compiten por CPU/puertos y provocan timeouts espurios en tests sin relación con el fallo real.

---

## Despliegue con Docker

La aplicación se distribuye como dos imágenes Docker sin privilegios (usuario no-root en ambas):

- `server`: Node.js, corre como usuario `node`.
- `client`: build estático servido por `nginx-unprivileged` en el puerto 8080 interno.

```bash
docker compose up -d
```

`docker-compose.yml` usa las imágenes publicadas en GHCR (`ghcr.io/bg-101/aas-live-server` y `aas-live-client`). El servidor requiere su propio `.env` en `./server/.env`.

### Actualización manual

El servidor **no** se auto-actualiza. Cada release no-prerelease publicada en GitHub reetiqueta `:latest` en GHCR (workflow `docker-release.yml`), pero aplicar el cambio requiere un pull explícito:

```bash
docker pull ghcr.io/bg-101/aas-live-server:v1.1.2
docker tag ghcr.io/bg-101/aas-live-server:v1.1.2 ghcr.io/bg-101/aas-live-server:latest

docker pull ghcr.io/bg-101/aas-live-client:v1.1.2
docker tag ghcr.io/bg-101/aas-live-client:v1.1.2 ghcr.io/bg-101/aas-live-client:latest

docker compose up -d
```

Para fijar una versión concreta en lugar de seguir `latest`, cambia los tags de ambos servicios en `docker-compose.yml`, ejecuta `docker compose pull` y después `docker compose up -d`.

---

_Desarrollado para la Asociación Almeriense de Speedcubing._

---

## Licencia

Este proyecto está bajo Licencia MIT Modificada con Atribución Obligatoria. Puedes usar, modificar y distribuir el código, incluso en versiones personalizadas para otros clubes o eventos, siempre que mantengas la mención a **AAS Live** y a su creador, **Marco Criado Gómez**. Ver [LICENSE](./LICENSE.txt) para el texto completo.
