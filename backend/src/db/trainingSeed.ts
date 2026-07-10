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

export interface QuizQuestion {
  pregunta: string;
  opciones: string[];
  correcta: number; // índice de la opción correcta
  explicacion: string;
}

interface SeedCourse {
  titulo: string;
  descripcion: string;
  etapa: number | null;
  lecciones: SeedLesson[];
  /** Quiz del módulo (fase 2): se presenta al final del curso. */
  quiz?: QuizQuestion[];
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
        video: "https://www.youtube.com/watch?v=YcI7_b_u7Rk",
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
        video: "https://www.youtube.com/watch?v=EvipNuwXUqw",
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
    ],
    quiz: [
      {
        pregunta: "¿Por qué Sandler compara la venta con un submarino de 7 compartimentos?",
        opciones: [
          "Porque hay que vender rápido antes de 'hundirse'",
          "Porque cada etapa debe cerrarse antes de avanzar a la siguiente",
          "Porque el vendedor debe mantenerse invisible ante el cliente",
          "Porque las ventas B2B duran 7 semanas en promedio"
        ],
        correcta: 1,
        explicacion: "El submarino avanza cerrando la compuerta de cada compartimento: no presentas precio sin conocer el dolor, ni cotizas sin saber quién decide."
      },
      {
        pregunta: "¿Cuál es la etapa con MAYOR peso en tu evaluación (25 de 100 puntos)?",
        opciones: ["Cierre / Cumplimiento", "Presupuesto", "Dolor (Pain)", "Vínculo y Confianza"],
        correcta: 2,
        explicacion: "El Dolor pesa 25 pts — más que Cierre y Post-Venta juntos. Sin dolor descubierto y cuantificado, la cotización compite solo por precio."
      },
      {
        pregunta: "Un cliente pide precio en el minuto 2. La respuesta 'igual a igual' es:",
        opciones: [
          "Darle el precio de inmediato para no incomodarlo",
          "Decirle que el precio es confidencial",
          "'Antes de cotizar necesito entender su operación; ¿me regala 15 minutos?'",
          "Ofrecerle un descuento de bienvenida"
        ],
        correcta: 2,
        explicacion: "El consultor de igual a igual no da consultoría ni precios sin entender el problema. Pedir permiso para descubrir mantiene la dirección de la llamada."
      },
      {
        pregunta: "¿Qué significa 'está bien decir no' en Sandler?",
        opciones: [
          "Rechazar clientes difíciles",
          "Un 'no' rápido vale más que un 'déjame pensarlo' eterno — para ambas partes",
          "Nunca aceptar la primera propuesta del cliente",
          "Decir no a todo descuento"
        ],
        correcta: 1,
        explicacion: "El derecho mutuo a decir 'no' elimina la persecución: descalificar a tiempo libera tu tiempo para prospectos reales."
      },
      {
        pregunta: "¿Para qué usa el equipo la pestaña de Coaching junto con este entrenamiento?",
        opciones: [
          "Para ver cuántas llamadas hizo cada quien",
          "Para conocer su etapa más débil REAL y entrenarla con las lecciones recomendadas",
          "Para escuchar las grabaciones de otros vendedores",
          "Para pedir aumentos de sueldo"
        ],
        correcta: 1,
        explicacion: "La IA mide tus llamadas con esta misma rúbrica; tu etapa más débil elige automáticamente tu ruta recomendada en Entrenamiento."
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

## 🎬 Diálogo modelo (60 segundos de vínculo)

> **Vendedor:** "Ing. Torres, gracias por tomarme la llamada. Vi que están arrancando el parque industrial de Apodaca — ¿cómo van con eso?"
> **Cliente:** "Uf, a marchas forzadas, arrancamos en 3 semanas."
> **Vendedor:** "Se nota el ritmo. ¿Usted lleva toda la operación o solo la parte de obra?"
> **Cliente:** "Obra y logística, por eso andamos viendo lo de las camionetas."
> **Vendedor:** "Perfecto, ahí voy a poder ayudarle o decirle honestamente si no. ¿Le parece si le hago unas preguntas primero?"

**Nota cómo:** usó el nombre, mostró interés real por SU proyecto (no por vender), y la transición al Contrato Previo salió natural.

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

## 🎬 Diálogo modelo (Contrato Previo en acción)

> **Vendedor:** "Juan, antes de entrar en tema: tenemos 20 minutos, ¿correcto? Le propongo esto — yo le hago unas preguntas sobre su operación para saber si de verdad podemos ayudarle; usted me pregunta lo que quiera; y al final decidimos juntos: avanzamos a una propuesta o lo dejamos aquí, y cualquiera de las dos está bien. ¿Le funciona?"
> **Cliente:** "Va, me parece justo."
> *…al final de la llamada…*
> **Vendedor:** "Entonces quedamos: el jueves a las 10 le presento el comparativo con su jefe de operaciones presente, y ahí deciden si avanzamos a contrato o lo descartamos. ¿Confirmamos?"
> **Cliente:** "Confirmado, jueves a las 10."

**Nota cómo:** tiempo ✓, objetivo ✓, derecho a decir no ✓, y salida con fecha, hora y decisores. Cero "le marco luego".

## Ponlo en práctica hoy

- [ ] Memoriza LA fórmula (adáptala a tus palabras) y úsala en las próximas 5 llamadas.
- [ ] Nunca termines una llamada sin siguiente paso con fecha Y hora.`
      },
      {
        titulo: "Etapa 3 · Dolor (25 pts) — ⭐ la etapa que decide la venta",
        etapa: 3,
        duracion: 15,
        video: "https://www.youtube.com/watch?v=fv7F4uo0Oqw",
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

## 🎬 Diálogo modelo (los 3 niveles en 90 segundos)

> **Cliente:** "Necesitamos 3 camionetas para julio." *(nivel 1: síntoma)*
> **Vendedor:** "Claro. ¿Y qué está pasando en julio que las hace necesarias?"
> **Cliente:** "Arranca la obra del hospital y las unidades propias ya no alcanzan."
> **Vendedor:** "¿Qué pasa con la obra si no las tienen a tiempo?" *(nivel 2: impacto de negocio)*
> **Cliente:** "Penalización del cliente y cuadrilla parada… unos 80 mil al mes, fácil."
> **Vendedor:** "¿Y a usted cómo le pega ese tema, personalmente?" *(nivel 3: impacto personal)*
> **Cliente:** "El director me lo recuerda cada lunes. Es mi responsabilidad."
> **Vendedor:** "Entiendo. Entonces esto no es de camionetas — es de que la obra no se detenga y usted no cargue con ese pendiente. Con eso claro, déjeme hacerle dos preguntas más antes de hablar de opciones."

**Nota cómo:** cero features. Tres preguntas convirtieron "3 camionetas" en un dolor de $80k/mes con presión del director. Ahora la renta compite contra la pérdida, no contra otra cotización.

## Ponlo en práctica hoy

- [ ] En la próxima llamada haz MÍNIMO 3 preguntas de dolor antes de mencionar cualquier producto.
- [ ] Cuantifica un dolor en pesos con el cliente ("¿cuánto les cuesta…?").`
      },
      {
        titulo: "Etapa 4 · Presupuesto (18 pts): hablar de dinero sin rodeos",
        etapa: 4,
        duracion: 12,
        video: "https://www.youtube.com/watch?v=_VKZYS8FW6c",
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

## 🎬 Diálogo modelo (la horquilla)

> **Vendedor:** "Juan, ya que dimensionamos el problema — los 80 mil al mes de paros — hablemos de inversión. ¿Tienen un rango presupuestado para resolverlo?"
> **Cliente:** "Pues… no exactamente, apenas lo estamos viendo."
> **Vendedor:** "Le doy contexto entonces: para una operación como la suya, esto suele andar entre 20 y 35 mil mensuales por unidad, todo incluido — seguro, mantenimiento y reemplazo. ¿Ese rango está dentro de lo que imaginaban, o estamos en otra película?"
> **Cliente:** "No, sí anda por ahí… pensábamos algo como 25."
> **Vendedor:** "Perfecto, con eso trabajo. Y para ponerlo en perspectiva: contra los 80 mil que se les van en paros, ¿cómo lo ven?"
> **Cliente:** "Visto así, se paga solo."

**Nota cómo:** la horquilla sacó el número real del cliente sin comprometerse a un precio, y el cierre contra el dolor hizo el resto. Cero descuentos.

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

## 🎬 Diálogo modelo (mapear sin interrogar)

> **Vendedor:** "Juan, para armarle una propuesta que sí camine adentro: además de usted, ¿quién más participa en esta decisión?"
> **Cliente:** "La ve finanzas y al final firma el director."
> **Vendedor:** "¿Y qué le pesa más a finanzas: el monto mensual, el plazo del contrato…?"
> **Cliente:** "El flujo. No quieren compromisos largos este año."
> **Vendedor:** "Buen dato — entonces propongo esquema a 6 meses renovable. Para que finanzas no la rebote por algo que yo pueda resolver de primera mano: ¿me incluye al licenciado en la reunión del jueves?"
> **Cliente:** "Sí, se lo comento."
> **Vendedor:** "¿Le parece si mejor le mando yo la invitación con usted en copia? Así no le cargo la tarea."

**Nota cómo:** mapeó decisores, criterio real (flujo, no precio) y se ganó el lugar en la mesa — sin dejar que el contacto "venda adentro" solo.

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

## 🎬 Diálogo modelo (el termómetro + pedir la decisión)

> **Vendedor:** "Recapitulando: el problema son los paros de cuadrilla, ~80 mil al mes. La propuesta es 3 doble cabina con reemplazo en 24 horas — ese es el punto clave, lo demás es estándar. Del 1 al 10, ¿qué tan resuelto ven su problema con esto?"
> **Cliente:** "Un 8."
> **Vendedor:** "¿Qué le falta para ser 10?"
> **Cliente:** "Saber qué pasa si la obra se extiende dos meses."
> **Vendedor:** "Buena pregunta: el contrato se extiende mes a mes con el mismo precio, sin penalización. ¿Con eso, dónde queda el número?"
> **Cliente:** "Ahí sí, un 10."
> **Vendedor:** "Entonces se lo pido directo, como acordamos al inicio: ¿avanzamos a contrato para tener las unidades el día 15, o lo descartamos?"
> **Cliente:** "Avanzamos."

**Nota cómo:** presentó SOLO lo que resuelve el dolor, tomó la temperatura, resolvió el faltante y pidió la decisión con las dos salidas. Sin presión y sin rodeos.

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

## 🎬 Diálogo modelo (los 3 movimientos después del sí)

> **Vendedor:** "Antes de colgar, recapitulemos para que no haya sorpresas: 3 doble cabina, entrega el 15, reemplazo en 24 horas, factura los días 1°. ¿Algo no cuadra?"
> **Cliente:** "Todo bien."
> **Vendedor:** "Una cosa más, Juan. Es normal que esta semana alguien adentro pregunte '¿y por qué no mejor compramos?'. Cuando pase, mándemelo directo — tengo el comparativo de capital listo para esa conversación."
> **Cliente:** "Ja, seguro pasa. Va."
> **Vendedor:** "Y su proveedor anterior probablemente les llame con una contraoferta. Si eso pasa, ¿me da chance de platicarlo antes de que decidan?"
> **Cliente:** "Me parece justo."
> **Vendedor:** "Última: cuando arranque la obra 2, ¿cómo ven cubrir esa flota? Lo dejo anotado para adelantarnos."

**Nota cómo:** expectativas ✓, vacuna contra el remordimiento ✓, competidor anticipado ✓ — y de regalo, la semilla del upsell que el sistema ya detecta en tus llamadas.

## Ponlo en práctica hoy

- [ ] Agrega los 3 movimientos a tu checklist de cierre.
- [ ] En tu próximo cierre, haz al menos la recapitulación de expectativas.`
      }
    ],
    quiz: [
      {
        pregunta: "Un cliente dice 'necesito 3 pickups para julio'. En Sandler, ¿qué es eso?",
        opciones: [
          "El dolor real: hay que cotizar 3 pickups de inmediato",
          "Un síntoma: falta descubrir el problema de negocio detrás",
          "Una objeción de precio disfrazada",
          "Una señal de compra para cerrar ya"
        ],
        correcta: 1,
        explicacion: "Es el nivel 1 (síntoma). El dolor real está en el nivel 2-3: obra que arranca, cuadrilla parada, capital inmovilizado. Sin llegar ahí, compites solo por precio."
      },
      {
        pregunta: "¿Cuál es la fórmula del Contrato Previo (Up-Front Contract)?",
        opciones: [
          "Enviar la cotización antes de la reunión",
          "Firmar un contrato de exclusividad al inicio",
          "Acordar tiempo + objetivo + qué hará cada quien + derecho a decir no",
          "Prometer el mejor precio del mercado"
        ],
        correcta: 2,
        explicacion: "El Contrato Previo alinea la llamada al inicio y elimina el 'le marco luego': la reunión termina con una decisión de avanzar o no."
      },
      {
        pregunta: "¿Cómo se CUANTIFICA el dolor en una llamada de flotillas?",
        opciones: [
          "Preguntando '¿cuánto les cuesta un día de cuadrilla parada?'",
          "Presentando el catálogo completo de unidades",
          "Ofreciendo un descuento por volumen",
          "Mencionando que somos líderes del mercado"
        ],
        correcta: 0,
        explicacion: "Cuantificar en pesos convierte tu renta de $25k/mes en la solución a $80k/mes de pérdidas — dejas de competir contra la cotización del rival."
      },
      {
        pregunta: "En la etapa de Presupuesto, ante 'se ve caro', el vendedor Sandler:",
        opciones: [
          "Ofrece un descuento inmediato",
          "Pregunta contra qué lo comparan y recuerda el costo de no resolver",
          "Sube el precio para dar margen a negociar",
          "Cambia de tema hacia las características del producto"
        ],
        correcta: 1,
        explicacion: "Descontar por ansiedad confirma que tu precio estaba inflado. Aislar la objeción y comparar contra el dolor mantiene el valor."
      },
      {
        pregunta: "El error más común en la etapa de Decisión es:",
        opciones: [
          "Preguntar demasiado sobre el proceso de compra",
          "Presentar solo a tu contacto y dejar que él 'venda adentro'",
          "Insistir en conocer a todos los decisores",
          "Preguntar por la competencia"
        ],
        correcta: 1,
        explicacion: "Tu contacto no sabe vender tu propuesta y pierde contra el de compras que solo compara números. Consigue estar frente a finanzas/dirección."
      },
      {
        pregunta: "¿Por qué la Post-Venta (5 pts) importa aunque valga poco?",
        opciones: [
          "Porque sube mucho el puntaje total",
          "Porque blinda la venta contra el remordimiento del comprador y el competidor desplazado",
          "Porque es obligatoria en el contrato",
          "Porque reemplaza al cierre"
        ],
        correcta: 1,
        explicacion: "Firmó, y esa noche duda; su proveedor anterior le llamará. Confirmar expectativas y anticipar la contraoferta evita que la venta se caiga en la semana."
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
        video: "https://www.youtube.com/watch?v=0MjHSw5P6D0",
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
    ],
    quiz: [
      {
        pregunta: "En el embudo del dolor, ¿cuál es el paso que da los puntos clave?",
        opciones: [
          "Preguntar el nombre de la empresa",
          "Cuantificar el costo del problema en pesos",
          "Presentar la propuesta",
          "Pedir referencias de otros clientes"
        ],
        correcta: 1,
        explicacion: "'¿Cuánto les costó eso el mes pasado?' transforma un síntoma vago en un dolor de $60k/mes — ahí está la venta."
      },
      {
        pregunta: "¿Qué es el 'reversing'?",
        opciones: [
          "Devolver el producto si no funciona",
          "Responder cada pregunta del cliente con otra pregunta (con ablandador)",
          "Bajar el precio poco a poco",
          "Repetir lo que dice el cliente"
        ],
        correcta: 1,
        explicacion: "Cada pregunta esconde una preocupación. Reversar con un ablandador ('buena pregunta, ¿qué…?') descubre qué hay detrás y mantiene la dirección."
      },
      {
        pregunta: "¿Cuántos reversings seguidos son el máximo recomendado?",
        opciones: ["1", "2-3", "5-6", "Los que hagan falta"],
        correcta: 1,
        explicacion: "Más de 2-3 se siente evasivo. Después de descubrir el contexto, responde con franqueza."
      },
      {
        pregunta: "El 'reverso negativo' consiste en:",
        opciones: [
          "Presionar más fuerte cuando el cliente duda",
          "Soltar la cuerda y moverte en dirección opuesta para que el cliente te persiga",
          "Ofrecer un descuento agresivo",
          "Amenazar con retirar la oferta"
        ],
        correcta: 1,
        explicacion: "'Suena a que esto no es prioridad ahora, ¿lo cerramos?' — si hay interés real, el cliente lo defiende y sale la objeción escondida."
      },
      {
        pregunta: "Ante 'está caro', ¿qué se mueve si hay que ceder algo?",
        opciones: [
          "El precio, de inmediato",
          "El alcance del paquete, no el precio a secas",
          "La fecha de entrega",
          "Nada, se termina la negociación"
        ],
        correcta: 1,
        explicacion: "Un precio que baja sin quitar nada nunca fue serio. 'Sin unidad de reemplazo baja a X, ¿les funciona ese riesgo?' mantiene el valor."
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
      `INSERT INTO courses (titulo, descripcion, etapa_sandler, orden, publicado, quiz, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?) RETURNING id`,
      [curso.titulo, curso.descripcion, curso.etapa, cOrden++, curso.quiz ? JSON.stringify(curso.quiz) : null, now, now]
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
