from data import parse_team_strengths, load_team_strengths


BOOTSTRAP = {
    "teams": [
        {"id": 1, "strength_attack_home": 1100, "strength_attack_away": 1050,
         "strength_defence_home": 1200, "strength_defence_away": 1150},
        {"id": 2, "strength_attack_home": 1300, "strength_attack_away": 1250,
         "strength_defence_home": 1000, "strength_defence_away": 1080},
    ]
}


def test_parse_team_strengths():
    m = parse_team_strengths(BOOTSTRAP)
    assert set(m.keys()) == {1, 2}
    assert m[1]["strength_defence_away"] == 1150
    assert m[2]["strength_attack_home"] == 1300


def test_load_team_strengths_uses_injected_fetch():
    class _Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return BOOTSTRAP

    captured = {}

    def fake_fetch(url, **kwargs):
        captured["url"] = url
        return _Resp()

    m = load_team_strengths(fetch=fake_fetch)
    assert "bootstrap-static" in captured["url"]
    assert m[1]["strength_attack_home"] == 1100
