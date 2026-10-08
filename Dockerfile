# Etapa 1: Construir el Frontend (Cliente)
FROM node:22-alpine AS build-client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Etapa 2: Construir el Backend (API)
FROM node:22-alpine AS build-api
WORKDIR /app/api
COPY api/package*.json ./
RUN npm ci
COPY api/ ./
RUN npm run build

# Etapa 3: Ensamblar la imagen de Producción
FROM node:22-alpine
WORKDIR /app

# Configurar el Backend
WORKDIR /app/api
COPY api/package*.json ./
RUN npm ci --omit=dev

# Copiar el código compilado del backend
COPY --from=build-api /app/api/dist ./dist

# Copiar el frontend compilado (El backend busca en ../../../client/dist desde dist/src/app.js)
WORKDIR /app/client
COPY --from=build-client /app/client/dist ./dist

# Volver al directorio de trabajo de la API para la ejecución
WORKDIR /app/api

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Arrancar la aplicación
CMD ["npm", "run", "start:prod"]
