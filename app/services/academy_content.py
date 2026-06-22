"""Contenido fijo de Guita Coach Academy — guías básicas de inversión."""

TOPICS = [
    {
        "id": "que-es-invertir",
        "category": "primeros_pasos",
        "title": "¿Qué es invertir?",
        "summary": "La diferencia entre ahorrar y poner tu plata a trabajar.",
        "body": (
            "Ahorrar es guardar dinero sin que pierda (demasiado) valor. Invertir es poner ese ahorro "
            "en un activo que puede generar una ganancia (o pérdida) a cambio de asumir un riesgo. "
            "Antes de invertir conviene tener un fondo de emergencia de 3 a 6 meses de gastos en algo "
            "líquido (plazo fijo, FCI money market), así no tenés que vender en el peor momento."
        ),
        "tags": ["is_beginner"],
    },
    {
        "id": "primer-portafolio",
        "category": "primeros_pasos",
        "title": "Cómo armar tu primer portafolio",
        "summary": "Empezá simple: pocos activos, bien entendidos, diversificados.",
        "body": (
            "No hace falta tener 15 activos para empezar. Un portafolio inicial razonable combina algo "
            "de renta fija en pesos (plazo fijo o FCI), algo dolarizado (CEDEARs o dólar MEP) y, si querés "
            "exposición a cripto, una porción chica (5-10%) del total. La clave no es elegir el activo "
            "'perfecto', es no jugarte todo a uno solo."
        ),
        "tags": ["is_beginner"],
    },
    {
        "id": "fondo-emergencia",
        "category": "riesgo",
        "title": "Fondo de emergencia antes de invertir",
        "summary": "Por qué conviene tener un colchón líquido antes de arriesgar capital.",
        "body": (
            "Si no tenés un fondo de emergencia, cualquier imprevisto te obliga a vender inversiones en "
            "el peor momento (cuando están en baja). La regla general es cubrir 3 a 6 meses de gastos "
            "fijos en un instrumento líquido antes de aumentar exposición a activos de riesgo."
        ),
        "tags": ["low_buffer"],
    },
    {
        "id": "ingreso-variable",
        "category": "riesgo",
        "title": "Invertir con ingresos variables",
        "summary": "Cómo planificar aportes cuando no cobrás un sueldo fijo todos los meses.",
        "body": (
            "Con ingresos variables conviene invertir un porcentaje del ingreso de cada mes (no un monto "
            "fijo), y mantener un colchón más grande que alguien con sueldo fijo — los meses flojos van a "
            "existir. Priorizá liquidez sobre rendimiento en la porción 'de resguardo'."
        ),
        "tags": ["variable_income"],
    },
    {
        "id": "acciones",
        "category": "activos",
        "title": "Acciones",
        "summary": "Sos dueño de una porción de una empresa real.",
        "body": (
            "Comprar una acción es comprar una parte de una empresa: si le va bien, el precio sube y/o "
            "paga dividendos; si le va mal, podés perder buena parte del capital. Mayor potencial de "
            "retorno a largo plazo que la renta fija, pero con volatilidad alta en el camino."
        ),
        "tags": ["diversified"],
    },
    {
        "id": "cedears",
        "category": "activos",
        "title": "CEDEARs",
        "summary": "Acciones de empresas extranjeras, compradas en pesos en el mercado local.",
        "body": (
            "Un CEDEAR representa una acción que cotiza en el exterior (Apple, Google, etc.) pero se "
            "compra y vende en pesos en la bolsa argentina. Te da exposición al dólar y a empresas "
            "globales sin necesidad de cuenta en el exterior. El precio sigue tanto a la acción "
            "subyacente como al tipo de cambio."
        ),
        "tags": ["crypto_only", "diversified"],
    },
    {
        "id": "cripto",
        "category": "activos",
        "title": "Criptomonedas",
        "summary": "Alta volatilidad, alto potencial, sin respaldo de ningún estado o empresa.",
        "body": (
            "Bitcoin, Ethereum y demás cotizan 24/7 y pueden moverse 10%+ en un día. No tienen flujo de "
            "caja ni balance detrás — su precio depende enteramente de oferta/demanda y expectativas. "
            "Como regla general, conviene que sea una porción menor del portafolio total, no la base."
        ),
        "tags": [],
    },
    {
        "id": "renta-fija",
        "category": "activos",
        "title": "Plazo fijo y FCI",
        "summary": "Las opciones más simples para la parte 'segura' del portafolio.",
        "body": (
            "El plazo fijo te da una tasa fija conocida de antemano, a cambio de no poder tocar el dinero "
            "hasta el vencimiento. Un Fondo Común de Inversión (FCI) money market es similar en riesgo "
            "pero con liquidez diaria, aunque la tasa varía día a día. Ninguno de los dos te protege "
            "completamente de la inflación, pero amortiguan la pérdida de poder de compra mejor que el "
            "efectivo parado."
        ),
        "tags": ["is_beginner", "low_buffer"],
    },
    {
        "id": "bonos",
        "category": "activos",
        "title": "Bonos",
        "summary": "Le prestás plata a un estado o empresa a cambio de un interés.",
        "body": (
            "Un bono es un préstamo: vos le das dinero al emisor (estado o empresa) y a cambio te paga "
            "interés periódico y devuelve el capital al vencimiento. El riesgo principal es que el "
            "emisor no pague (riesgo de default) — por eso un bono argentino y uno de EE.UU. no tienen "
            "el mismo riesgo aunque ambos sean 'bonos'."
        ),
        "tags": ["diversified"],
    },
    {
        "id": "volatilidad",
        "category": "indicadores",
        "title": "Volatilidad",
        "summary": "Qué tanto se mueve el precio de un activo, para arriba y para abajo.",
        "body": (
            "La volatilidad mide cuánto varía el precio de un activo en un período. Mayor volatilidad no "
            "es 'malo' por sí solo, pero implica que podés ver caídas grandes en el camino antes de ver "
            "una ganancia. Cripto y acciones individuales suelen ser más volátiles que un FCI de renta "
            "fija o un bono soberano de corto plazo."
        ),
        "tags": [],
    },
    {
        "id": "ratio-riesgo-beneficio",
        "category": "indicadores",
        "title": "Ratio riesgo-beneficio",
        "summary": "Cuánto podés perder versus cuánto podés ganar en una misma decisión.",
        "body": (
            "Antes de entrar a una posición, preguntate: ¿cuánto estoy dispuesto a perder si me equivoco, "
            "y cuánto espero ganar si tengo razón? Un ratio de 1:3 (arriesgo 1 para potencialmente ganar "
            "3) es mucho más sano que uno de 1:1, incluso si el segundo 'parece' más seguro a corto plazo."
        ),
        "tags": [],
    },
    {
        "id": "rendimientos-promedio",
        "category": "indicadores",
        "title": "Rendimientos promedio históricos",
        "summary": "Referencias generales — el pasado no garantiza el futuro.",
        "body": (
            "Históricamente, en períodos largos (10+ años) las acciones globales rindieron más que los "
            "bonos, y los bonos más que el efectivo — pero con mucha más volatilidad en el camino. Estos "
            "son promedios de décadas, no una promesa de lo que va a pasar el año que viene. Usalos para "
            "entender el orden de magnitud esperado, no para proyectar ganancias concretas."
        ),
        "tags": [],
    },
    {
        "id": "diversificacion",
        "category": "riesgo",
        "title": "Diversificación",
        "summary": "No pongas todos los huevos en la misma canasta.",
        "body": (
            "Diversificar significa repartir el capital entre activos que no se mueven todos igual al "
            "mismo tiempo. Si todo tu portafolio es cripto, una mala noticia del sector te golpea entero. "
            "Combinar activos con comportamientos distintos (renta fija + acciones + algo de cripto) "
            "reduce el impacto de un mal momento en una sola categoría."
        ),
        "tags": ["crypto_only"],
    },
    {
        "id": "position-sizing",
        "category": "riesgo",
        "title": "Position sizing (cuánto poner en cada activo)",
        "summary": "El tamaño de cada apuesta importa tanto como elegirla bien.",
        "body": (
            "Incluso una buena idea de inversión puede hacerte mucho daño si le metés un porcentaje "
            "demasiado grande del portafolio. Una práctica común es limitar cualquier posición individual "
            "de alto riesgo a un porcentaje chico del total (por ejemplo, no más del 10-15%), para que un "
            "error puntual no comprometa el conjunto."
        ),
        "tags": ["diversified"],
    },
]

CATEGORY_LABELS = {
    "primeros_pasos": "Primeros pasos",
    "activos": "Tipos de activos",
    "indicadores": "Indicadores financieros",
    "riesgo": "Risk management",
}

GLOSSARY = [
    {
        "term": "Activo",
        "definition_formal": (
            "Un activo es cualquier recurso económico que una persona o empresa posee y que tiene "
            "la capacidad de generar valor futuro, ya sea por su uso, venta o por los ingresos que produce."
        ),
        "definition_simple": (
            "Es todo lo que tenés y que te puede dar plata o se puede vender. Si lo tenés y te suma, "
            "es un activo."
        ),
        "example": (
            "Un plazo fijo, las acciones que compraste, tu auto si lo usás para trabajar de Uber, "
            "o el dinero en tu caja de ahorro. Todo eso son activos."
        ),
    },
    {
        "term": "Pasivo",
        "definition_formal": (
            "Un pasivo es una obligación financiera o deuda que una persona o empresa debe afrontar, "
            "es decir, dinero que le debés a alguien."
        ),
        "definition_simple": (
            "Es lo que le debés a otro. Si lo tenés y te saca plata del bolsillo todos los meses, "
            "es un pasivo."
        ),
        "example": (
            "El saldo de tu tarjeta de crédito, un préstamo personal, o las cuotas de un crédito "
            "hipotecario. Todo eso es plata que tenés que devolver."
        ),
    },
    {
        "term": "Presupuesto",
        "definition_formal": (
            "Un presupuesto es un plan financiero que organiza los ingresos y egresos esperados "
            "durante un período determinado, permitiendo controlar el destino del dinero."
        ),
        "definition_simple": (
            "Es armar de antemano en qué vas a gastar la plata que entra, para no terminar el mes "
            "preguntándote a dónde se fue todo."
        ),
        "example": (
            "Si ganás $500.000 por mes, un presupuesto simple sería: $250.000 para alquiler y comida "
            "(necesidades), $150.000 para salidas y gustos, y $100.000 para ahorro."
        ),
    },
    {
        "term": "Fondo de Emergencia",
        "definition_formal": (
            "Es una reserva de dinero líquida destinada a cubrir gastos imprevistos o pérdida de "
            "ingresos, generalmente equivalente a 3-6 meses de gastos esenciales."
        ),
        "definition_simple": (
            "Es la plata que dejás guardada 'por si las moscas' — se te rompe el auto, te echan del "
            "trabajo, o te enfermás. Está ahí para que un imprevisto no te funda."
        ),
        "example": (
            "Si gastás $300.000 por mes en lo esencial, tu fondo de emergencia ideal sería de "
            "$1.800.000, guardado en algo líquido como una caja de ahorro o un FCI money market, "
            "no en algo que tarde semanas en convertirse en efectivo."
        ),
    },
    {
        "term": "Inflación",
        "definition_formal": (
            "La inflación es el aumento generalizado y sostenido de los precios de bienes y servicios "
            "en una economía, que reduce el poder de compra de la moneda."
        ),
        "definition_simple": (
            "Es cuando la plata vale cada vez menos. Lo que hoy comprás con $1.000, el mes que viene "
            "te sale más caro, aunque el billete sea el mismo."
        ),
        "example": (
            "Si el kilo de asado costaba $3.000 el año pasado y hoy cuesta $4.500, gran parte de ese "
            "aumento es inflación: la plata se devaluó, no necesariamente el asado se hizo 'mejor'."
        ),
    },
    {
        "term": "Tasa de Interés (Nominal vs. Real)",
        "definition_formal": (
            "La tasa nominal es el porcentaje de interés que se cobra o paga sin ajustar por "
            "inflación. La tasa real es ese mismo interés descontando la inflación del período, y "
            "refleja la ganancia o pérdida real de poder de compra."
        ),
        "definition_simple": (
            "La nominal es el número que te muestran en el cartel del banco. La real es la posta: "
            "cuánto realmente ganaste después de que la inflación se comió una parte."
        ),
        "example": (
            "Si un plazo fijo te paga 5% mensual (nominal) pero la inflación de ese mes fue 4%, tu "
            "tasa real es de apenas ~1%. Ganaste mucho menos de lo que el cartel prometía."
        ),
    },
    {
        "term": "Interés Compuesto",
        "definition_formal": (
            "Es el mecanismo por el cual los intereses generados por una inversión se reinvierten, "
            "generando a su vez nuevos intereses sobre el capital acumulado, no solo sobre el "
            "capital inicial."
        ),
        "definition_simple": (
            "Es 'el interés que genera interés'. Como una bola de nieve: cuanto más tiempo la dejás "
            "rodar, más grande se hace, no porque la empujes más fuerte sino porque va sumando sobre "
            "lo que ya sumó."
        ),
        "example": (
            "Si invertís $100.000 al 5% mensual y reinvertís las ganancias, el primer mes tenés "
            "$105.000. El segundo mes el 5% se calcula sobre $105.000 (no sobre los $100.000 "
            "originales), y así crece cada vez más rápido con el tiempo."
        ),
    },
    {
        "term": "Rendimiento (ROI)",
        "definition_formal": (
            "El Retorno de Inversión (ROI) es una métrica que mide la ganancia o pérdida generada "
            "por una inversión en relación al capital invertido, expresada generalmente en porcentaje."
        ),
        "definition_simple": (
            "Es la respuesta a la pregunta '¿cuánto gané (o perdí) en relación a lo que puse?'."
        ),
        "example": (
            "Si invertiste $50.000 en una acción y hoy esa posición vale $60.000, tu ROI es del 20% "
            "— ganaste $10.000 sobre los $50.000 que pusiste."
        ),
    },
    {
        "term": "Liquidez",
        "definition_formal": (
            "La liquidez es la facilidad y rapidez con la que un activo puede convertirse en dinero "
            "en efectivo sin perder valor significativo."
        ),
        "definition_simple": (
            "Es qué tan rápido podés volver tu inversión en plata contante y sonante si la necesitás "
            "de un día para el otro."
        ),
        "example": (
            "El dinero en tu caja de ahorro es súper líquido (lo sacás ya). Un plazo fijo a 30 días "
            "es menos líquido (tenés que esperar o pagar una penalidad). Un departamento es muy poco "
            "líquido (puede tardar meses en venderse)."
        ),
    },
    {
        "term": "Diversificación",
        "definition_formal": (
            "La diversificación es una estrategia de gestión de riesgo que consiste en distribuir "
            "las inversiones entre distintos activos, sectores o monedas, para reducir el impacto "
            "de que uno de ellos rinda mal."
        ),
        "definition_simple": (
            "Es no poner todos los huevos en la misma canasta. Si se te cae una canasta, no perdés "
            "todos los huevos."
        ),
        "example": (
            "En vez de poner el 100% de tus ahorros en una sola acción, repartís entre cedears, "
            "bonos, un poco de plazo fijo y quizás algo de cripto. Si una de esas inversiones rinde "
            "mal, las otras pueden compensar."
        ),
    },
    {
        "term": "Perfil de Riesgo (Conservador, Moderado, Agresivo)",
        "definition_formal": (
            "El perfil de riesgo es la clasificación del nivel de volatilidad y posible pérdida de "
            "capital que un inversor está dispuesto a tolerar, en función de su situación financiera, "
            "objetivos y horizonte temporal."
        ),
        "definition_simple": (
            "Es cuánto 'sobresalto' podés bancarte ver en tu cuenta de inversión sin perder el sueño. "
            "Conservador: dormís tranquilo aunque ganes poco. Agresivo: aguantás bajones grandes a "
            "cambio de buscar ganancias mayores."
        ),
        "example": (
            "Un perfil conservador prioriza un FCI money market o plazo fijo. Un perfil moderado "
            "mezcla bonos y algunos cedears. Un perfil agresivo puede tener gran parte de su cartera "
            "en acciones o cripto, aceptando que el valor suba y baje fuerte en el camino."
        ),
    },
    {
        "term": "Volatilidad",
        "definition_formal": (
            "La volatilidad mide la magnitud y frecuencia de las variaciones de precio de un activo "
            "en un período determinado; a mayor volatilidad, mayor incertidumbre sobre su valor "
            "futuro a corto plazo."
        ),
        "definition_simple": (
            "Es cuánto 'sube y baja' el precio de algo. Una inversión volátil es una montaña rusa; "
            "una poco volátil es una calle recta."
        ),
        "example": (
            "El bitcoin puede subir 10% en un día y bajar 15% al día siguiente: alta volatilidad. "
            "Un plazo fijo no se mueve un centavo día a día: volatilidad prácticamente nula."
        ),
    },
    {
        "term": "Renta Fija (ej. Plazo Fijo, Bonos)",
        "definition_formal": (
            "La renta fija comprende instrumentos de inversión que ofrecen un rendimiento predefinido "
            "o pactado de antemano (tasa fija o variable conocida), con menor riesgo relativo y menor "
            "potencial de ganancia que la renta variable."
        ),
        "definition_simple": (
            "Es 'prestarle' tu plata a alguien (un banco, el Estado, una empresa) a cambio de que te "
            "devuelva más de lo que pusiste, en un plazo y con condiciones que ya sabés de antemano."
        ),
        "example": (
            "Un plazo fijo en el banco, o un bono soberano argentino (como un AL30), te dicen de "
            "entrada cuánto vas a cobrar y cuándo. Es más predecible, aunque no está exento de riesgo "
            "(el emisor podría no pagar)."
        ),
    },
    {
        "term": "Renta Variable (ej. Acciones, Cedears)",
        "definition_formal": (
            "La renta variable agrupa instrumentos cuyo rendimiento no está garantizado de antemano, "
            "ya que depende de la evolución del mercado y del desempeño del activo subyacente, "
            "ofreciendo mayor potencial de ganancia (y de pérdida)."
        ),
        "definition_simple": (
            "Es comprar una porción de una empresa (o de un fondo que sigue empresas) sin saber de "
            "antemano si vas a ganar o perder, ni cuánto. Podés ganar mucho, pero también podés perder."
        ),
        "example": (
            "Comprar acciones de YPF, o un cedear de Apple, son renta variable: su precio sube o baja "
            "todos los días según cómo le va a la empresa y al mercado."
        ),
    },
    {
        "term": "Fondo Común de Inversión (FCI)",
        "definition_formal": (
            "Un FCI es un vehículo de inversión colectiva que reúne el dinero de muchos inversores "
            "para invertirlo en una cartera diversificada de activos, administrada por una sociedad "
            "gerente, según la estrategia declarada del fondo."
        ),
        "definition_simple": (
            "Es juntar tu plata con la de un montón de gente más para que un equipo profesional la "
            "invierta por todos, repartiendo entre varios activos. Vos comprás 'cuotapartes' del fondo."
        ),
        "example": (
            "Un FCI money market invierte en instrumentos de corto plazo y muy líquidos, ideal para "
            "parquear el fondo de emergencia. Un FCI de renta variable invierte en acciones, con más "
            "riesgo y potencial de ganancia."
        ),
    },
    {
        "term": "Bróker (o Agente de Liquidación y Compensación - ALyC)",
        "definition_formal": (
            "Un bróker o ALyC es una entidad regulada y autorizada para actuar como intermediario en "
            "la compra y venta de instrumentos financieros en los mercados de valores, ejecutando las "
            "órdenes de sus clientes."
        ),
        "definition_simple": (
            "Es la 'puerta de entrada' al mercado. Vos no podés comprar acciones directamente en la "
            "bolsa; necesitás a alguien habilitado que lo haga por vos."
        ),
        "example": (
            "Cocos Capital, Bull Market, Invertir Online o Portfolio Personal son ALyC/brokers donde "
            "abrís una cuenta para comprar y vender acciones, bonos o cedears en Argentina."
        ),
    },
    {
        "term": "Dividendos",
        "definition_formal": (
            "Los dividendos son la porción de las ganancias de una empresa que se distribuye entre "
            "sus accionistas, generalmente en efectivo o en nuevas acciones, como retribución por "
            "mantener la inversión."
        ),
        "definition_simple": (
            "Es cuando la empresa de la que sos 'dueño' (por tener sus acciones) te da una parte de "
            "lo que ganó, sin que tengas que vender nada."
        ),
        "example": (
            "Si tenés acciones de una empresa que reparte dividendos y declara un pago de $50 por "
            "acción, y vos tenés 100 acciones, cobrás $5.000 simplemente por ser accionista, además "
            "de cualquier suba o baja del precio de la acción."
        ),
    },
    {
        "term": "Bull Market vs. Bear Market (Mercado Alcista y Bajista)",
        "definition_formal": (
            "Un mercado alcista (bull market) es un período prolongado de subas generalizadas en los "
            "precios de los activos, asociado a optimismo y crecimiento económico. Un mercado bajista "
            "(bear market) es lo opuesto: una caída sostenida de precios, generalmente vinculada a "
            "pesimismo o recesión."
        ),
        "definition_simple": (
            "Bull market es cuando 'todo sube' y la gente está optimista, como un toro que embiste "
            "para arriba con los cuernos. Bear market es cuando 'todo baja' y el clima es de "
            "pesimismo, como un oso que ataca golpeando hacia abajo con sus patas."
        ),
        "example": (
            "Durante un bull market, comprar casi cualquier acción tiende a darte ganancia con el "
            "tiempo. Durante un bear market, hasta las buenas empresas pueden ver caer su valor por "
            "el clima general del mercado."
        ),
    },
    {
        "term": "ETF (Exchange-Traded Fund)",
        "definition_formal": (
            "Un ETF es un fondo de inversión que cotiza en bolsa como si fuera una acción, y que "
            "generalmente busca replicar el comportamiento de un índice, sector o canasta de activos."
        ),
        "definition_simple": (
            "Es como comprar 'un combo' de muchas empresas o activos de una sola vez, con una sola "
            "operación, en lugar de comprar cada una por separado."
        ),
        "example": (
            "El ETF SPY busca replicar el índice S&P 500 de Estados Unidos. Comprando una sola unidad "
            "de SPY, estás 'comprando un poquito' de las 500 empresas más grandes de EE.UU. al mismo "
            "tiempo."
        ),
    },
    {
        "term": "Capacidad de Ahorro",
        "definition_formal": (
            "La capacidad de ahorro es la proporción de los ingresos que una persona puede destinar "
            "a ahorro o inversión después de cubrir todos sus gastos, y depende tanto del nivel de "
            "ingresos como de los hábitos de consumo."
        ),
        "definition_simple": (
            "Es cuánto te queda realmente disponible para guardar o invertir después de pagar todo "
            "lo que tenés que pagar. No depende solo de cuánto ganás, sino también de cuánto gastás."
        ),
        "example": (
            "Dos personas pueden ganar lo mismo ($500.000), pero si una gasta $480.000 y la otra "
            "$350.000, la segunda tiene una capacidad de ahorro mucho mayor ($150.000 vs $20.000), "
            "aunque ganen exactamente igual."
        ),
    },
]
