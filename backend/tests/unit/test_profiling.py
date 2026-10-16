"""Unit tests for the profiling LLM abstraction: context retriever + parser."""

import uuid

from src.domain.entities.process import PerfilamientoModule, Process
from src.domain.entities.profiling import Confidence
from src.services.profiling.context import build_context
from src.services.profiling.parser import parse_result


def _process(**overrides) -> Process:
    base = dict(
        consultant_id=uuid.uuid4(),
        company_id=uuid.uuid4(),
        perfilamiento_module=PerfilamientoModule.SST,
        perfilamiento_answers={},
    )
    base.update(overrides)
    return Process(**base)


class TestBuildContext:
    def test_module_and_label(self):
        ctx = build_context(_process(), "Acme")
        assert ctx.module == "sst"
        assert ctx.module_label  # group title resolved from the questionnaire

    def test_qa_in_questionnaire_order_with_labels(self):
        ctx = build_context(
            _process(perfilamiento_answers={"sst_01": "Cumplir", "base_01": "Empresa SA"}),
            "Acme",
        )
        labels = [label for label, _ in ctx.qa]
        # base_01 appears before sst_01 (questionnaire order)
        assert "Razón social y NIT de la empresa" in labels
        assert labels.index("Razón social y NIT de la empresa") < len(labels)
        values = dict(ctx.qa)
        assert values["Razón social y NIT de la empresa"] == "Empresa SA"

    def test_pain_points_extracted_and_not_in_qa(self):
        ctx = build_context(
            _process(perfilamiento_answers={"base_01": "X", "pain_points": "Sin indicadores"}),
            "Acme",
        )
        assert ctx.pain_points == "Sin indicadores"
        assert all(label != "pain_points" for label, _ in ctx.qa)

    def test_unset_module_yields_empty_module(self):
        ctx = build_context(_process(perfilamiento_module=None), "Acme")
        assert ctx.module == ""
        assert ctx.module_label == ""

    def test_chips_list_answers_joined(self):
        ctx = build_context(
            _process(perfilamiento_answers={"opt_02": ["ISO 14001", "ISO 45001"]}),
            "Acme",
        )
        values = dict(ctx.qa)
        assert any("ISO 14001, ISO 45001" == v for v in values.values())


class TestParseResult:
    def test_parses_full_payload(self):
        raw = {
            "pain_points_analysis": "## Crítico\nFalta medición",
            "cost_estimation": {
                "range_cop": "30 a 80 millones COP",
                "breakdown": ["Consultoría", "Auditoría"],
                "confidence": "high",
            },
            "time_estimation": {"months": 6, "phases": ["Diagnóstico"], "confidence": "medium"},
            "action_plan": {
                "phases": [
                    {"name": "Diagnóstico", "duration_weeks": 4, "activities": ["Levantar procesos"]}
                ],
                "milestones": ["Lanzamiento"],
            },
        }
        result = parse_result(raw)
        assert result.pain_points_analysis.startswith("## Crítico")
        assert result.cost_estimation.range_cop == "30 a 80 millones COP"
        assert result.cost_estimation.breakdown == ["Consultoría", "Auditoría"]
        assert result.cost_estimation.confidence == Confidence.HIGH
        assert result.time_estimation.months == 6
        assert result.time_estimation.confidence == Confidence.MEDIUM
        assert result.action_plan.phases[0].name == "Diagnóstico"
        assert result.action_plan.phases[0].duration_weeks == 4
        assert result.action_plan.milestones == ["Lanzamiento"]

    def test_empty_input_defaults(self):
        result = parse_result({})
        assert result.pain_points_analysis == ""
        assert result.cost_estimation.range_cop == ""
        assert result.cost_estimation.breakdown == []
        assert result.cost_estimation.confidence == Confidence.MEDIUM
        assert result.time_estimation.months == 0
        assert result.action_plan.phases == []
        assert result.action_plan.milestones == []

    def test_non_dict_input_does_not_raise(self):
        result = parse_result(None)  # type: ignore[arg-type]
        assert result.time_estimation.months == 0

    def test_unknown_confidence_maps_to_medium(self):
        result = parse_result({"cost_estimation": {"range_cop": "X", "confidence": "bananas"}})
        assert result.cost_estimation.confidence == Confidence.MEDIUM

    def test_string_months_coerced_and_phase_without_name_dropped(self):
        result = parse_result(
            {
                "time_estimation": {"months": "9"},
                "action_plan": {"phases": [{"duration_weeks": 2}, {"name": "OK"}]},
            }
        )
        assert result.time_estimation.months == 9
        assert [p.name for p in result.action_plan.phases] == ["OK"]
