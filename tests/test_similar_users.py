from app.modules.users.similar import agreement_percent


def test_agreement_percent_bounds():
    assert agreement_percent(0) == 100
    assert agreement_percent(4) == 0
    assert agreement_percent(1) == 75
    assert agreement_percent(9) == 0
