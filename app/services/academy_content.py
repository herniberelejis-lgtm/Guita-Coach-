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
