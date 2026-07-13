from core.llm import parse_tool_call


def test_tool_call_valide():
    resp = 'Je vérifie. <JARVIS_TOOL>{"name": "get_weather", "args": {"city": "Paris"}}</JARVIS_TOOL>'
    assert parse_tool_call(resp) == ("get_weather", {"city": "Paris"})


def test_sans_tool_call():
    assert parse_tool_call("Bonjour Monsieur.") is None


def test_json_invalide():
    assert parse_tool_call("<JARVIS_TOOL>{pas du json}</JARVIS_TOOL>") is None


def test_nom_manquant():
    assert parse_tool_call('<JARVIS_TOOL>{"args": {}}</JARVIS_TOOL>') is None


def test_args_par_defaut():
    assert parse_tool_call('<JARVIS_TOOL>{"name": "take_screenshot"}</JARVIS_TOOL>') == (
        "take_screenshot", {},
    )
