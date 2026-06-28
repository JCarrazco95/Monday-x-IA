# Rúbrica de evaluación de llamadas — Sistema Sandler

Evalúa una llamada de ventas B2B de MAXIRent (renta de flotillas) bajo el **Sistema
Sandler** (David Sandler). El vendedor ideal actúa como un consultor de igual a igual:
construye confianza, descubre el **dolor** real, califica presupuesto y proceso de
decisión **antes** de presentar, y cierra con compromisos claros. Se penaliza el "modo
vendedor" (hablar de features sin descubrir, perseguir, descontar por ansiedad).

> Basado en el método público "Sandler Selling System" (submarino de 7 compartimentos).
> No incluye material propietario con copyright de Sandler Systems.

## Las 7 etapas y su ponderación (suman 100)

1. **Vínculo y Confianza — Bonding & Rapport (12 pts).**
   Rapport honesto y profesional, tono de igual a igual, uso del nombre, sin adulación ni
   guion robótico. No saltar a producto demasiado rápido.

2. **Contrato Previo — Up-Front Contract (13 pts).**
   Acordar al inicio: agenda, tiempo, objetivo, posibles resultados y el "derecho mutuo a
   decir no". Evita reuniones sin rumbo y el "le marco luego".

3. **Dolor — Pain (25 pts) [LA MÁS IMPORTANTE].**
   Descubrir el dolor real con preguntas, no afirmaciones. Profundizar en 3 niveles
   (síntoma -> impacto de negocio -> impacto personal). Cuantificar el costo de no resolver.
   Vender features = puntaje bajo.

4. **Presupuesto — Budget (18 pts).**
   Hablar de dinero sin rodeos: capacidad y disposición a invertir, rango, costo de la
   inacción. No avanzar a propuesta sin claridad económica.

5. **Decisión — Decision (17 pts).**
   Entender el proceso: quién decide, cómo, cuándo, criterios, competencia y qué pasa si no
   se decide. Identificar a todos los involucrados.

6. **Cierre / Cumplimiento — Fulfillment (10 pts).**
   Presentar solo lo que resuelve el dolor descubierto (no un catálogo). Pedir el
   compromiso explícito y dejar un siguiente paso claro y fechado.

7. **Post-Venta — Post-Sell (5 pts).**
   Blindar la venta: confirmar expectativas, anticipar remordimiento del comprador y la
   reaparición de competidores.

## Estado por etapa

Para cada etapa asigna puntaje 0-100 y estado:
cumplida (>=75), parcial (50-74), deficiente (<50) o no_aplica.
Incluye aciertos, fallos y evidencia (citas textuales con hablante y marca de tiempo).

## Puntaje final y bandas

puntajeFinal = promedio ponderado por peso (0-100).
- Verde (>= 75): ejecución Sandler sólida.
- Amarillo (50-74): aceptable, con áreas de mejora.
- Rojo (< 50): predominó la venta reactiva / de features.

## Esquema de salida (JSON)

```json
{
  "resumen": "",
  "vehiculosMencionados": [],
  "fechasMencionadas": [],
  "compromisos": [{ "descripcion": "", "responsable": "", "fecha": "" }],
  "objeciones": [],
  "sentimiento": "positivo | neutro | negativo",
  "probabilidadCierre": "alta | media | baja",
  "sandler": {
    "puntajeFinal": 0,
    "banda": "rojo | amarillo | verde",
    "etapas": [
      { "id": 1, "nombre": "Vínculo y Confianza", "peso": 12, "puntaje": 0, "estado": "parcial", "aciertos": [], "fallos": [], "evidencia": [{ "cita": "", "hablante": "vendedor", "marcaTiempo": "00:08" }] }
    ],
    "fortalezas": [],
    "areasMejora": [],
    "recomendaciones": [{ "prioridad": "alta", "etapa": "Dolor (Pain)", "accion": "", "ejemploFrase": "" }],
    "momentoClave": ""
  }
}
```

## Material a aportar por MAXIRent (mejora la precisión)

- Guion/checklist Sandler interno (etapas, preguntas de dolor típicas del giro).
- 2-3 transcripciones reales (buena, regular, mala) para calibrar puntajes.
- Objeciones frecuentes (precio, plazo, seguro, kilometraje) con respuestas modelo.
