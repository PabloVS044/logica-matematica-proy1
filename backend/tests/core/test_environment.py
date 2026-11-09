from evaluador.core.environment import Environment, build_environment


def test_update_creates_new_environment() -> None:
    l = Environment({"x": "a"})  # noqa: E741 — notación del curso
    updated = l.update("x", "b").update("y", "c")
    assert l("x") == "a"
    assert updated("x") == "b"
    assert updated("y") == "c"
    assert updated.label == "l[x↦b][y↦c]"


def test_restricted_to() -> None:
    l = Environment({"x": "a", "y": "b"})  # noqa: E741
    assert l.restricted_to(["y", "z"]) == (("y", "b"),)


def test_valid_environment() -> None:
    result = build_environment({"x": "1"}, ["x"], ["1", "2"])
    assert result.diagnostics == []
    assert result.environment is not None
    assert result.environment("x") == "1"


def test_missing_and_invalid_assignments() -> None:
    result = build_environment({"y": "9", "z": ""}, ["x", "y", "z"], ["1", "2"])
    assert result.environment is None
    assert [d.code for d in result.diagnostics] == ["E-ENV-001", "E-ENV-002", "E-ENV-001"]


def test_extra_assignment_is_a_warning() -> None:
    result = build_environment({"x": "1", "w": "2"}, ["x"], ["1", "2"])
    assert result.environment is not None
    assert [d.code for d in result.diagnostics] == ["W-ENV-001"]
    assert "w" not in result.environment.values


def test_sentence_needs_no_environment() -> None:
    result = build_environment({}, [], ["1"])
    assert result.environment is not None
    assert result.diagnostics == []
