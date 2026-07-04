# MAXIRent frontend (Vite build -> Nginx, con proxy /api al backend)
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# Render/Railway inyectan PORT; BACKEND_URL = URL publica del backend.
# API_KEY (o VITE_API_KEY, se acepta cualquiera) = la misma clave que el backend;
# Nginx la inyecta como header x-api-key en el proxy /api (server-side, en
# RUNTIME: no queda en el bundle de JS y se rota sin rebuild).
ENV PORT=8080
ENV BACKEND_URL=http://localhost:4000
CMD ["/bin/sh","-c","export API_KEY=\"${API_KEY:-$VITE_API_KEY}\" && envsubst '${PORT} ${BACKEND_URL} ${API_KEY}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
