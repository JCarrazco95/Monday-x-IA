# Rúbrica de evaluación de llamadas — Modelo Challenger Sale

Evalúa una llamada de ventas B2B de MAXIRent (renta de flotillas) bajo el método
**Challenger Sale** (Dixon & Adamson). El vendedor ideal **enseña, adapta y toma el
control** ("Teach, Tailor, Take Control"), aportando una idea comercial que reta el
statu quo del cliente. Asigna puntos por criterio (suma 100) y devuelve el desglose.

> Basado en el método público de Challenger (challengerinc.com / "The Challenger Sale").
> No incluye material propietario con copyright de Challenger Inc.

## Criterios y pesos (total 100)

1. **Teach — Commercial Insight (25 pts).**
   ¿El vendedor aportó una perspectiva o dato relevante que el cliente no había
   considerado y que reta su forma de operar (p. ej. costo real de tener flota propia,
   capital inmovilizado, riesgo de mantenimiento)? Más evidencia y especificidad = más puntos.

2. **Reframe — Reencuadre (15 pts).**
   ¿Reencuadró el problema del cliente hacia una nueva dimensión (de "rentar autos" a
   "optimizar su costo total de movilidad / liberar capital")? Conectó el insight con un
   dolor de negocio concreto.

3. **Tailor — Mensaje a la medida (20 pts).**
   ¿Adaptó el mensaje al rol e intereses del interlocutor (dueño, compras, finanzas,
   operaciones) y a la industria/contexto del cliente? Habló en términos de valor para *ese* decisor.

4. **Take Control — Tomar el control (20 pts).**
   ¿Condujo la conversación con seguridad: habló de dinero/precio sin rodeos, manejó
   objeciones, presionó (constructivamente) por compromisos y propuso el siguiente paso?

5. **Constructive Tension — Tensión constructiva (10 pts).**
   ¿Generó tensión sana (retar respetuosamente) sin caer en complacencia ni en venta
   pasiva? Evitó el perfil "Relationship Builder" puro.

6. **Next Step / Commitment — Cierre con compromiso (10 pts).**
   ¿Cerró con un siguiente paso claro, fechado y verificable (no un "le marco luego")?

## Bandas (igual que Sandler, para comparar)

- **Verde** (≥ 75): ejecución Challenger sólida.
- **Amarillo** (50–74): aceptable, con áreas claras de mejora.
- **Rojo** (< 50): ejecución deficiente; predominó la venta reactiva o de relación.

## Perfil del vendedor (clasificación Challenger)

Clasifica el estilo predominante observado en la llamada:
`challenger`, `hard_worker`, `lone_wolf`, `relationship_builder`, `reactive_problem_solver`.
El objetivo es acercarse al perfil **challenger**.

## Esquema de salida (JSON sugerido)

```json
{
  "score": 0,
  "banda": "rojo | amarillo | verde",
  "perfilVendedor": "challenger | hard_worker | lone_wolf | relationship_builder | reactive_problem_solver",
  "dimensiones": [
    { "criterio": "Teach — Commercial Insight", "puntos": 0, "max": 25, "justificacion": "" },
    { "criterio": "Reframe", "puntos": 0, "max": 15, "justificacion": "" },
    { "criterio": "Tailor", "puntos": 0, "max": 20, "justificacion": "" },
    { "criterio": "Take Control", "puntos": 0, "max": 20, "justificacion": "" },
    { "criterio": "Constructive Tension", "puntos": 0, "max": 10, "justificacion": "" },
    { "criterio": "Next Step / Commitment", "puntos": 0, "max": 10, "justificacion": "" }
  ],
  "fortalezas": [],
  "areasMejora": [],
  "insightSugerido": "Idea comercial concreta para retar al cliente en la próxima llamada",
  "reframeSugerido": "Cómo reencuadrar el problema del cliente",
  "siguientePaso": "Siguiente paso recomendado, concreto y fechado"
}
```

## Material a aportar por MAXIRent (mejora la precisión)

- 3–5 "commercial insights" propios sobre renta de flotas vs. flota propia (datos, % de ahorro,
  riesgos, casos) para que el agente sepa qué argumentos de "enseñanza" son válidos.
- Opcional: 2–3 transcripciones de llamadas reales (una buena, una regular, una mala) para calibrar.
