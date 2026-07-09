import { db } from "./index.js";

// ===========================================================================
//  Contenido inicial de ENTRENAMIENTO — Sistema Sandler para MAXIRent.
//
//  Contenido ORIGINAL en español, alineado a la rúbrica del sistema
//  (call-intelligence/rubrica-sandler.md: 7 etapas, pesos que suman 100) y al
//  giro de renta de flotillas. Basado en el método público "Sandler Selling
//  System"; NO incluye material propietario de Sandler Systems.
//
//  Se siembra SOLO si la tabla courses está vacía: lo que el admin edite o
//  cree después nunca se sobreescribe. video_url queda listo para pegar
//  cualquier enlace de YouTube (se embebe automáticamente en la lección).
// ===========================================================================

interface SeedLesson {
  titulo: string;
  etapa: number | null;
  duracion: number;
  video?: string;
  contenido: string;
}

interface SeedCourse {
  titulo: string;
  descripcion: string;
  etapa: number | null;
  lecciones: SeedLesson[];
}

const CURSOS: SeedCourse[] = [
  // ──────────────────────────────────────────────────────────────────────────
  {
    titulo: "Fundamentos del Sistema Sandler",
    descripcion:
      "Qué es el método Sandler, por qué funciona en la venta B2B de flotillas y cómo te evalúa la IA de MAXIRent en cada llamada. Empieza aquí.",
    etapa: null,
    lecciones: [
      {
        titulo: "El submarino Sandler: 7 compartimentos en orden",
        etapa: null,
        duracion: 10,
        contenido: `## La idea central

David Sandler comparaba la venta con un **submarino de 7 compartimentos**: para avanzar al siguiente, cierras la compuerta del anterior. No presentas precio sin conocer el dolor; no cotizas sin saber quién decide.

**Las 7 etapas (y su peso en tu evaluación):**

1. **Vínculo y Confianza** (12 pts) — rapport de igual a igual.
2. **Contrato Previo** (13 pts) — acordar agenda, tiempo y "derecho a decir no".
3. **Dolor** (25 pts) — ⭐ la más importante: descubrir el problema real.
4. **Presupuesto** (18 pts) — hablar de dinero sin rodeos.
5. **Decisión** (17 pts) — quién decide, cómo y cuándo.
6. **Cierre / Cumplimiento** (10 pts) — presentar SOLO lo que resuelve el dolor.
7. **Post-Venta** (5 pts) — blindar la venta cerrada.

## Por qué el orden importa

El vendedor tradicional hace lo contrario: presenta primero, pregunta después, y persigue al final. Resultado: cotizaciones que "se enfrían", clientes que "lo van a pensar" y descuentos por ansiedad.

En Sandler, **si una etapa temprana falla, NO avanzas** — retrocedes y la cierras. Es preferible descalificar un prospecto a tiempo que perseguirlo tres meses.

## En renta de flotillas

El cliente que pide "cotización de 3 pickups" casi nunca tiene un problema de pickups: tiene **unidades paradas, capital inmovilizado o una obra que arranca**. Ese es el compartimento del dolor — y sin abrirlo, tu cotización compite solo por precio.

## Ponlo en práctica hoy

- [ ] Antes de tu próxima llamada, escribe qué etapa vas a trabajar.
- [ ] Si el cliente pide precio en el minuto 2, anota qué hiciste (lo veremos en Contrato Previo).
- [ ] Revisa tu última llamada en Call Intelligence: ¿qué etapa salió más baja?`
      },
      {
        titulo: "Romper el 'modo vendedor': igual a igual",
        etapa: null,
        duracion: 8,
        contenido: `## El problema del "modo vendedor"

El comprador B2B tiene un sistema aprendido: pedir información, obtener el precio, desaparecer, y usar tu cotización para negociar con su proveedor actual. El vendedor tradicional lo alimenta: habla de features, manda PDFs, persigue.

**Sandler rompe ese guion.** Actúas como un consultor de igual a igual: tu tiempo vale, tu flota es finita, y no toda empresa es cliente para MAXIRent.

## Cómo suena "igual a igual" (giro flotillas)

| Modo vendedor ❌ | Igual a igual ✅ |
|---|---|
| "Le mando la cotización hoy mismo" | "Antes de cotizar necesito entender su operación; ¿me regala 15 minutos?" |
| "Tenemos las mejores unidades y el mejor precio" | "No sé todavía si podemos ayudarle. ¿Me cuenta qué está pasando con su flota?" |
| "¿Entonces qué le pareció la propuesta?" (5ª llamada) | "Quedamos en decidir el viernes. ¿Seguimos en eso, o cambió algo?" |

## Las 3 reglas de oro

1. **No des consultoría gratis**: el comparativo de costos se presenta en reunión, no se manda por correo "para que lo revisen".
2. **Está bien decir no** — y que te digan no. Un "no" rápido vale más que un "déjame pensarlo" eterno.
3. **El que pregunta, dirige.** Si solo respondes preguntas del cliente, él vende y tú compras.

## Ponlo en práctica hoy

- [ ] Detecta tu frase de "modo vendedor" más frecuente y escríbele su versión igual-a-igual.
- [ ] En la próxima llamada, responde una pregunta de precio con una pregunta (lección de Reversing en el curso avanzado).`
      },
      {
        titulo: "Cómo te evalúa la IA de MAXIRent (y cómo usarla a tu favor)",
        etapa: null,
        duracion: 8,
        contenido: `## Tu coach automático

Cada llamada que entra por Aircall se analiza con IA bajo **la misma rúbrica de este entrenamiento**: las 7 etapas Sandler con sus pesos (suman 100), más el modelo Challenger. No es vigilancia: es un coach que escucha todas tus llamadas y te dice exactamente dónde ganar puntos.

## Qué mide

- **Puntaje por etapa (0-100)** con evidencia: citas textuales de lo que dijiste.
- **Banda**: 🟢 verde (≥75), 🟡 amarillo (50-74), 🔴 rojo (<50).
- **Tu etapa más débil** — la que más te conviene entrenar (aparece en el ranking de Coaching y elige tus lecciones recomendadas aquí).
- **Mejoras accionables** con frases listas para usar — te llegan como comentario en Monday después de cada llamada.

## Cómo usarlo a tu favor

1. **Después de cada llamada importante**, abre su análisis en Call Intelligence: lee la etapa más baja y UNA mejora. No intentes arreglar todo a la vez.
2. **Cada semana**, mira tu tendencia en Coaching: ¿tu etapa débil está subiendo?
3. **Estudia las 🏅 del ranking**: cada insignia es una etapa dominada (promedio ≥75). Colecciónalas.
4. **Ve a la Biblioteca** (⭐ Mejores llamadas): son llamadas reales del equipo con banda verde — escucha cómo suena hacerlo bien.

## Dato clave

El **Dolor pesa 25 de 100 puntos** — más que Cierre y Post-Venta juntos. Si solo puedes entrenar una cosa este mes, entrena el embudo del dolor (curso "Las 7 etapas", lección 3).

## Ponlo en práctica hoy

- [ ] Abre Coaching y anota tu etapa más débil actual.
- [ ] Completa las lecciones recomendadas que aparecen arriba en esta pestaña.`
      }
    ]
  },
  // ──────────────────────────────────────────────────────────────────────────
  {
    titulo: "Las 7 etapas Sandler aplicadas a renta de flotillas",
    descripcion:
      "El curso central: una lección por etapa, con frases listas para usar en el giro de MAXIRent, errores comunes y cómo la mide la IA.",
    etapa: null,
    lecciones: [
      {
        titulo: "Etapa 1 · Vínculo y Confianza (12 pts)",
        etapa: 1,
        duracion: 10,
        contenido: `## Qué es

Rapport **honesto y profesional**: tono de igual a igual, usar el nombre del cliente, escuchar de verdad. NO es adulación ("¡qué gusto saludarle, licenciado!") ni small talk forzado de 10 minutos.

## Cómo se ve BIEN (flotillas)

- "Juan, gracias por tomar la llamada. Antes de entrar en tema, ¿cómo van con el arranque de la obra que me comentó su compañero?"
- Espejear el lenguaje del cliente: si dice "camionetas", no lo corrijas a "unidades pick-up".
- Reconocer sin vender: "Suena a que traen buen ritmo de crecimiento."

## Cómo se ve MAL

- Entrar directo a producto: "Le llamo para platicarle de nuestras promociones de renta."
- Adulación genérica o guion robótico leído.
- Hablar el 80% del tiempo. En esta etapa el cliente debería hablar más que tú.

## Errores comunes en el equipo

1. Saltar el rapport "porque el cliente tiene prisa" — 60 segundos de vínculo genuino te compran 10 minutos de atención.
2. Confundir simpatía con confianza: el cliente no te compra por caerle bien, te compra porque confía en que entiendes su operación.

## Cómo lo mide la IA

Busca: uso del nombre, tono de igual a igual, interés genuino en el negocio del cliente, y penaliza entrar a producto demasiado rápido.

## Ponlo en práctica hoy

- [ ] En tu próxima llamada, dedica los primeros 60-90 segundos SOLO a la persona y su operación.
- [ ] Usa el nombre del cliente al menos 2 veces de forma natural.`
      },
      {
        titulo: "Etapa 2 · Contrato Previo (13 pts) — la etapa que casi nadie hace",
        etapa: 2,
        duracion: 12,
        contenido: `## Qué es

Un **acuerdo verbal al inicio** de cada llamada/reunión sobre: agenda, tiempo, objetivo, posibles resultados y el **derecho mutuo a decir "no"**. Es la etapa más débil del equipo según los datos — y la más fácil de subir.

## La fórmula (30 segundos)

> "Juan, le propongo algo: tenemos **20 minutos**; le hago **unas preguntas sobre su operación** para saber si realmente podemos ayudarle, usted me pregunta lo que quiera, y **al final decidimos juntos si tiene sentido avanzar o no** — y si no, me lo dice con toda confianza. ¿Le parece?"

Componentes: ⏱️ tiempo + 🎯 objetivo + 🔄 qué hará cada quien + 🚪 derecho a decir no.

## Por qué funciona

- Elimina el "le marco luego para ver qué le pareció" (la llamada TERMINA con una decisión: avanzar o no).
- Baja la guardia del cliente: le acabas de dar permiso de rechazarte.
- Te da autoridad para preguntar de dinero y decisión después ("como acordamos, necesito entender su presupuesto…").

## Contrato previo de SALIDA

Antes de colgar, siempre el siguiente con fecha:

> "Entonces quedamos así: le presento el comparativo **el jueves a las 10** con su jefe de operaciones, y ahí deciden si avanzamos a contrato o lo descartamos. ¿De acuerdo?"

## Cómo lo mide la IA

Busca acuerdos explícitos de agenda/tiempo/objetivo al inicio y un siguiente paso fechado al final. "Le marco la próxima semana" = puntaje bajo.

## Ponlo en práctica hoy

- [ ] Memoriza LA fórmula (adáptala a tus palabras) y úsala en las próximas 5 llamadas.
- [ ] Nunca termines una llamada sin siguiente paso con fecha Y hora.`
      },
      {
        titulo: "Etapa 3 · Dolor (25 pts) — ⭐ la etapa que decide la venta",
        etapa: 3,
        duracion: 15,
        contenido: `## Qué es

Descubrir el **problema real** detrás de la solicitud — con preguntas, no afirmaciones. Nadie renta 3 pickups por gusto: hay obra que arranca, unidades en el taller, capital que no alcanza o un contrato nuevo que cumplir.

## Los 3 niveles del dolor

1. **Síntoma** (lo que dicen): "Necesitamos 3 camionetas para julio."
2. **Impacto de negocio**: "¿Y qué pasa en la obra si no las tienen en julio?" → "Pagamos penalización al cliente y la cuadrilla se queda parada."
3. **Impacto personal**: "¿Y eso a usted cómo le pega?" → "El director me trae en friega; es mi responsabilidad."

**Regla:** no presentes ni cotices hasta llegar al nivel 2 como mínimo. En el nivel 3 la venta casi se cierra sola.

## Cuantificar el dolor (el paso que da los puntos)

> "Solo para dimensionarlo: ¿cuánto les cuesta un día de cuadrilla parada?... ¿Y cuántos días llevan así este año?"

Ahora tu renta de $25,000/mes compite contra $80,000 de pérdidas, no contra la cotización del competidor.

## Preguntas de dolor para flotillas (guárdalas)

- "¿Qué los hace buscar renta justo ahora?"
- "¿Qué pasa hoy cuando se les descompone una unidad?"
- "¿Cuánto capital tienen inmovilizado en la flota actual y qué harían con ese dinero?"
- "Si no resuelven esto este mes, ¿qué pasa?"

## Cómo se ve MAL

- "Tenemos pickups doble cabina 2025, GPS incluido, seguro amplio…" (features sin dolor = puntaje bajo garantizado).
- Aceptar el síntoma como si fuera el dolor y correr a cotizar.

## Cómo lo mide la IA

Cuenta preguntas de descubrimiento, profundización en niveles y cuantificación en pesos. Es el 25% de tu puntaje total.

## Ponlo en práctica hoy

- [ ] En la próxima llamada haz MÍNIMO 3 preguntas de dolor antes de mencionar cualquier producto.
- [ ] Cuantifica un dolor en pesos con el cliente ("¿cuánto les cuesta…?").`
      },
      {
        titulo: "Etapa 4 · Presupuesto (18 pts): hablar de dinero sin rodeos",
        etapa: 4,
        duracion: 12,
        contenido: `## Qué es

Confirmar que el cliente **puede y quiere invertir** — antes de armar propuesta. Hablar de dinero incomoda al vendedor promedio; por eso el que lo hace bien destaca.

## Cómo abrir el tema (después del dolor)

> "Juan, ya que dimensionamos el problema (~$80,000/mes en paros), hablemos de inversión: ¿tienen un rango presupuestado para resolver esto, o lo están construyendo apenas?"

Si no hay cifra, ofrece **horquilla**:

> "Para una operación como la suya, esto suele estar entre $20 y $35 mil mensuales por unidad, todo incluido. ¿Ese rango está dentro de lo que imaginaban, o estamos en otra película?"

La horquilla provoca una reacción honesta sin comprometerte a un precio.

## El costo de la inacción (tu mejor aliado)

> "Lo pongo en perspectiva: mantener su flota propia les inmoviliza ~30% más de capital al año entre compra, mantenimiento y depreciación. No decidir también cuesta."

## Cómo se ve MAL

- Mandar cotización sin haber hablado NUNCA de rango presupuestal.
- Ofrecer descuento a la primera objeción ("se ve caro" → "le puedo mejorar el precio"). Eso es ansiedad, no negociación.
- "El precio se lo mando por correo" — el dinero se habla de frente.

## Cómo lo mide la IA

Busca conversación económica explícita: rango, capacidad, disposición, costo de no resolver. Evadir el tema o descontar por ansiedad baja el puntaje.

## Ponlo en práctica hoy

- [ ] Practica la pregunta de rango en voz alta 5 veces hasta que salga natural.
- [ ] En tu próxima llamada, NO ofrezcas descuento; pregunta "¿contra qué lo están comparando?"`
      },
      {
        titulo: "Etapa 5 · Decisión (17 pts): mapear quién, cómo y cuándo",
        etapa: 5,
        duracion: 12,
        contenido: `## Qué es

Entender el **proceso de decisión completo** antes de presentar: quién firma, quién influye, con qué criterios, en qué tiempos, y contra quién compites.

## Las 5 preguntas del mapa

1. "Además de usted, ¿quién más participa en esta decisión?" (en flotillas casi siempre: operaciones + finanzas + dirección)
2. "¿Cómo la toman? ¿Comité, firma del director, licitación interna?"
3. "¿Qué criterios pesan más: precio, disponibilidad, servicio, plazo?"
4. "¿Para cuándo necesitan las unidades rodando?" (fecha real, no 'pronto')
5. "¿Están viendo otras opciones? ¿Qué les gusta y qué no de ellas?"

## El error que mata ventas

Presentarle la propuesta **solo a tu contacto** y dejar que él la "venda adentro". Tu contacto no sabe vender tu propuesta — pierde contra el de compras que solo compara números.

> "Para que la propuesta le sirva a finanzas, ¿me incluye al Lic. en la reunión del jueves? Así resuelvo sus dudas de primera mano."

## Señal de alerta

"Yo decido solo" en una empresa de 200 empleados casi nunca es cierto. Valídalo: "Perfecto — ¿y la firma del contrato también la hace usted directamente?"

## Cómo lo mide la IA

Busca que identifiques decisores, proceso, criterios, tiempos y competencia. "Mi jefe no está convencido" apareciendo en la llamada 3 = etapa 5 fallada en la llamada 1.

## Ponlo en práctica hoy

- [ ] En cada oportunidad abierta que tengas, escribe quién firma. Si no lo sabes, esa es tu siguiente pregunta.`
      },
      {
        titulo: "Etapa 6 · Cierre / Cumplimiento (10 pts): presentar para decidir",
        etapa: 6,
        duracion: 10,
        contenido: `## Qué es

La presentación llega **al final** (compartimentos 1-5 cerrados) y solo incluye **lo que resuelve el dolor descubierto**. El cierre no es presión: es pedir la decisión que ya acordaron tomar (contrato previo).

## La presentación termómetro

Conecta cada elemento con SU dolor, no con tu catálogo:

> "Me dijeron que el problema son los paros de cuadrilla ($80k/mes). Por eso la propuesta incluye **unidad de reemplazo en 24h** — ese es el punto clave, lo demás es estándar. ¿Cómo lo ven?"

Y toma la temperatura: "Del 1 al 10, ¿qué tan resuelto ven su problema con esto?" — si dicen 6, pregunta "¿qué le falta para ser 9?" ANTES de hablar de firma.

## Pedir el compromiso (sin miedo)

> "Acordamos que hoy decidían. ¿Avanzamos a contrato para tener las unidades el día 15, o lo descartamos?"

Ambas respuestas son victoria: un sí, o un no que te libera para el siguiente prospecto.

## Cómo se ve MAL

- Presentar catálogo completo "para que vean todo lo que ofrecemos".
- Terminar con "cualquier cosa estoy a sus órdenes" (= sin compromiso).
- Bajar el precio en la mesa sin que nadie lo pidiera.

## Cómo lo mide la IA

Busca presentación ligada al dolor, compromiso explícito solicitado y siguiente paso con fecha. Es la diferencia entre "quedamos así" y "quedó en verlo".

## Ponlo en práctica hoy

- [ ] En tu próxima presentación, elimina todo slide/párrafo que no responda a un dolor que el cliente te dijo.
- [ ] Practica pedir la decisión con las dos salidas (sí / no) sin rodeos.`
      },
      {
        titulo: "Etapa 7 · Post-Venta (5 pts): blindar lo cerrado",
        etapa: 7,
        duracion: 8,
        contenido: `## Qué es

Los 5 minutos **después del sí** que evitan que la venta se caiga en la semana siguiente. El remordimiento del comprador es real: firmó, y esa noche piensa "¿habré hecho bien?" — y su proveedor anterior le va a llamar.

## El blindaje (3 movimientos)

**1. Confirmar expectativas en voz alta:**
> "Recapitulemos: 3 pickups doble cabina, entrega el 15, reemplazo en 24h, factura los días 1°. ¿Algo no cuadra con lo que esperaban?"

**2. Vacunar contra el remordimiento:**
> "Juan, es normal que en estos días alguien adentro pregunte '¿y por qué no compramos mejor?'. Cuando pase, mándemelo — tengo el comparativo de capital listo."

**3. Anticipar al competidor desplazado:**
> "Su proveedor actual probablemente les llame con una contraoferta. Si eso pasa, ¿me da chance de platicarlo antes de que decidan?"

## Bonus: la semilla del crecimiento

El post-venta es el mejor momento para sembrar upsell (el sistema ya detecta estas señales en tus llamadas):

> "Cuando arranque la obra 2, ¿cómo ven cubrir esa flota? Lo dejo anotado para adelantarnos."

## Cómo lo mide la IA

Es la etapa que casi nunca aparece en las llamadas del equipo (promedio actual: 40). Mencionar expectativas, remordimiento o competencia después del acuerdo ya te pone arriba del promedio.

## Ponlo en práctica hoy

- [ ] Agrega los 3 movimientos a tu checklist de cierre.
- [ ] En tu próximo cierre, haz al menos la recapitulación de expectativas.`
      }
    ]
  },
  // ──────────────────────────────────────────────────────────────────────────
  {
    titulo: "Técnicas Sandler avanzadas",
    descripcion:
      "Herramientas tácticas para las situaciones difíciles: el embudo del dolor completo, responder preguntas con preguntas, el reverso negativo y la objeción de precio.",
    etapa: null,
    lecciones: [
      {
        titulo: "El embudo del dolor: la secuencia completa de preguntas",
        etapa: 3,
        duracion: 12,
        contenido: `## La secuencia (de superficie a fondo)

1. **"Cuénteme más de eso…"** — abre sin dirigir.
2. **"¿Puede darme un ejemplo reciente?"** — aterriza en hechos.
3. **"¿Cuánto tiempo llevan así?"** — dimensiona la cronicidad.
4. **"¿Qué han intentado para resolverlo?"** — descarta soluciones falladas (y a tu competencia).
5. **"¿Y eso funcionó?"** — deja que ellos mismos descarten.
6. **"¿Cuánto calculan que les ha costado?"** — 💰 cuantificación.
7. **"¿Cómo se siente usted con esto?"** — impacto personal (nivel 3).
8. **"¿Ya se rindieron con esto, o todavía quieren resolverlo?"** — compromiso de avanzar.

No es interrogatorio: intercala escucha activa ("ok…", "ya veo", silencio) y espejea sus palabras.

## Ejemplo real (flotillas)

- Cliente: "Las unidades propias ya están muy castigadas."
- "¿Castigadas cómo? Cuénteme más." → "Se nos paran 2 o 3 por semana."
- "¿Y qué pasa cuando se para una?" → "La cuadrilla espera o rentamos de emergencia carísimo."
- "¿Cuánto les costó eso el mes pasado?" → "Unos 60 mil, fácil."
- "¿Y usted cómo anda con ese tema?" → "El director me lo recuerda cada lunes."

En 90 segundos pasaste de "camionetas castigadas" a un dolor de $60k/mes con presión del director. **Esa es la venta.**

## Ponlo en práctica hoy

- [ ] Imprime la secuencia o tenla a la vista en tus llamadas de esta semana.
- [ ] Meta: llegar al paso 6 (cuantificar) en toda llamada de descubrimiento.`
      },
      {
        titulo: "Reversing: responder preguntas con preguntas",
        etapa: 3,
        duracion: 10,
        contenido: `## La técnica

Cada pregunta del cliente esconde una preocupación. Si la respondes directo, adivinas; si la **reversas**, descubres qué hay detrás — y mantienes la dirección de la llamada.

**Fórmula:** ablandador + pregunta de vuelta.

## Ejemplos (flotillas)

| Cliente pregunta | Reversing |
|---|---|
| "¿Cuánto cuesta la renta mensual?" | "Buena pregunta — depende del uso. ¿La necesitan para carga en obra o para personal? ¿Qué rango tenían en mente?" |
| "¿Tienen unidades disponibles ya?" | "Tenemos — ¿qué tan urgente es? ¿Qué pasa si no las tienen esta semana?" |
| "¿Incluye seguro y mantenimiento?" | "¿Qué les ha pasado con eso antes? ¿Es un punto que les haya dolido?" |
| "¿Me mejoras el precio del competidor?" | "Puede ser — ¿qué les gusta de su propuesta y qué no les convence?" |

## Las reglas

1. **Máximo 2-3 reversings seguidos** — más se siente evasivo. Después responde con franqueza.
2. Siempre con **ablandador** ("buena pregunta", "me da gusto que lo saque") para que no suene a esquive.
3. El objetivo NO es no responder: es responder **con contexto** que tú descubriste.

## Ponlo en práctica hoy

- [ ] Elige LA pregunta que más te hacen (seguramente precio) y escribe tu reversing personal.
- [ ] Úsalo mañana y anota qué descubriste que no sabías.`
      },
      {
        titulo: "El reverso negativo: despegarse para avanzar",
        etapa: 6,
        duracion: 10,
        contenido: `## La técnica menos intuitiva de Sandler

Cuando el cliente duda o se enfría, el instinto dice "presiona". Sandler dice lo contrario: **suelta un poco la cuerda** — muévete ligeramente en dirección opuesta y deja que el cliente te persiga a ti.

## Ejemplos (flotillas)

- Cliente tibio: "Déjame pensarlo…"
  > "Claro. Y Juan, con confianza: por cómo lo veo, suena a que esto **no** es prioridad ahora mismo. ¿Lo cerramos aquí y no le quito más tiempo?"

  → Si de verdad no hay interés, ganaste claridad. Si lo hay, el cliente lo defenderá: "No, no, sí nos urge, lo que pasa es que…" — y ahí sale la objeción REAL.

- Cliente que regatea de más:
  > "Le soy honesto: por el nivel de servicio que necesitan, quizá nosotros no somos la opción más barata. ¿Quiere que le recomiende alternativas?"

## Por qué funciona

Nadie quiere lo que le sobra a todos; todos quieren lo que se puede ir. El reverso negativo te saca del papel de perseguidor y revela la verdad: interés real u objeción escondida.

## Advertencias

- Tono **genuino y relajado**, jamás sarcástico o pasivo-agresivo.
- Úsalo cuando tengas señales de enfriamiento, no en clientes que avanzan bien.
- Tienes que estar dispuesto a aceptar el "sí, ciérralo" — si no, es manipulación y se nota.

## Ponlo en práctica hoy

- [ ] Identifica tu oportunidad más "enfriada" del pipeline y aplícale un reverso negativo esta semana. El sistema de Seguimiento (NBA) te dice cuáles llevan más días sin actividad.`
      },
      {
        titulo: "La objeción de precio sin descuentos",
        etapa: 4,
        duracion: 12,
        contenido: `## "Está caro" casi nunca significa caro

Significa: "no veo suficiente valor **todavía**", "tengo una cotización más baja", o "me entrenaron para decir esto". El descuento inmediato confirma que tu precio era inflado y educa al cliente a regatear siempre.

## La secuencia anti-descuento

**1. Aislar:**
> "Entiendo. Fuera del precio, ¿hay algo más que les detenga? … Entonces, si el número cuadrara, ¿avanzamos?"

**2. Comparar contra el dolor (no contra el competidor):**
> "Lo pongo en contexto: hablamos de $28,000/mes contra los ~$60,000/mes que les están costando los paros. ¿Cómo lo ven visto así?"

**3. Reversar la comparación:**
> "¿Caro contra qué? … ¿Y esa opción incluye reemplazo en 24 horas? ¿Qué pasa con su obra si la unidad tarda una semana en taller?"

**4. Si hay que mover algo, mueve ALCANCE, no precio:**
> "Puedo ajustar el número si ajustamos el paquete: sin unidad de reemplazo baja a X. ¿Les funciona ese riesgo?"

Un precio que baja sin quitar nada nunca fue serio.

## El dato para MAXIRent

La objeción más frecuente del equipo (según Coaching) es **comparación de precio con competidores y proveedor anterior**. Prepara tu comparativa de costo TOTAL (renta vs. flota propia: capital, mantenimiento, depreciación, paros) — es tu arma para el paso 2.

## Ponlo en práctica hoy

- [ ] Escribe tu versión de los pasos 1-3 con tus palabras.
- [ ] Próxima objeción de precio: prohibido ofrecer descuento en esa llamada. Usa la secuencia y anota qué pasó.`
      }
    ]
  }
];

/** Siembra los cursos SOLO si la tabla está vacía (nunca pisa ediciones del admin). */
export async function seedTraining(): Promise<void> {
  const row = await db.queryOne<{ c: number }>("SELECT CAST(COUNT(*) AS INTEGER) as c FROM courses");
  if ((row?.c ?? 0) > 0) return;

  const now = new Date().toISOString();
  let cOrden = 0;
  let totalLecciones = 0;
  for (const curso of CURSOS) {
    const res = await db.queryOne<{ id: number }>(
      `INSERT INTO courses (titulo, descripcion, etapa_sandler, orden, publicado, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?) RETURNING id`,
      [curso.titulo, curso.descripcion, curso.etapa, cOrden++, now, now]
    );
    const courseId = res?.id;
    if (!courseId) continue;
    let lOrden = 0;
    for (const l of curso.lecciones) {
      await db.run(
        `INSERT INTO lessons (course_id, titulo, contenido, video_url, etapa_sandler, duracion_min, orden, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [courseId, l.titulo, l.contenido, l.video ?? null, l.etapa, l.duracion, lOrden++, now, now]
      );
      totalLecciones++;
    }
  }
  console.log(`   Entrenamiento: ${CURSOS.length} cursos y ${totalLecciones} lecciones Sandler sembrados.`);
}
