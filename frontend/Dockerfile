FROM node:22-slim AS build

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./
# Vite inlines these at build time, so they are build args rather than runtime env.
ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_AEGIS_API_TOKEN=dev-local-token
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_AEGIS_API_TOKEN=$VITE_AEGIS_API_TOKEN
RUN npm run build

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
