"""Tests for domain entities — derived purely from the spec.

The spec says:
- Process: id, consultant_id, company_id, iso_standard (iso9001/14001/45001),
  status (in_diagnosis/plan_ready/in_progress/completed), created_at, updated_at
- Finding: id, process_id, answers (dict), free_text, updated_at
- Plan: id, process_id, summary_md, generated_at
- Task: id, plan_id, title, description, priority (low/medium/high),
  estimated_effort, owner_role, sort_order
- Company: company_id, user_id, business_type, is_active, name
"""

import uuid
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError


class TestProcessEntity:
    def test_default_status_is_in_diagnosis(self):
        from src.domain.entities.process import Process, ProcessStatus

        process = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            iso_standard="iso9001",
        )
        assert process.status == ProcessStatus.IN_DIAGNOSIS

    def test_iso_standard_accepts_three_values(self):
        from src.domain.entities.process import Process

        for iso in ("iso9001", "iso14001", "iso45001"):
            p = Process(
                consultant_id=uuid.uuid4(),
                company_id=uuid.uuid4(),
                iso_standard=iso,
            )
            assert p.iso_standard.value == iso

    def test_iso_standard_rejects_unknown(self):
        from src.domain.entities.process import Process

        with pytest.raises(ValidationError):
            Process(
                consultant_id=uuid.uuid4(),
                company_id=uuid.uuid4(),
                iso_standard="iso27001",
            )

    def test_status_enum_has_four_values(self):
        from src.domain.entities.process import ProcessStatus

        assert {s.value for s in ProcessStatus} == {
            "in_diagnosis",
            "plan_ready",
            "in_progress",
            "completed",
        }

    def test_id_is_auto_generated(self):
        from src.domain.entities.process import Process

        p1 = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            iso_standard="iso9001",
        )
        p2 = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            iso_standard="iso9001",
        )
        assert p1.id != p2.id
        assert isinstance(p1.id, uuid.UUID)

    def test_timestamps_are_timezone_aware_utc(self):
        from src.domain.entities.process import Process

        p = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            iso_standard="iso9001",
        )
        assert p.created_at.tzinfo is not None
        assert p.created_at.tzinfo == timezone.utc


class TestFindingEntity:
    def test_default_answers_is_empty_dict(self):
        from src.domain.entities.finding import Finding

        f = Finding(process_id=uuid.uuid4())
        assert f.answers == {}
        assert f.free_text == ""

    def test_answers_can_be_arbitrary_dict(self):
        from src.domain.entities.finding import Finding

        answers = {
            "q_company_size": "11-50",
            "q_industry": "Manufactura",
            "q_free": "Some long text",
        }
        f = Finding(process_id=uuid.uuid4(), answers=answers, free_text="notas libres")
        assert f.answers == answers
        assert f.free_text == "notas libres"


class TestPlanAndTaskEntities:
    def test_plan_defaults_empty_summary(self):
        from src.domain.entities.plan import Plan

        p = Plan(process_id=uuid.uuid4())
        assert p.summary_md == ""
        assert p.tasks == []
        assert isinstance(p.generated_at, datetime)

    def test_task_priority_enum(self):
        from src.domain.entities.plan import TaskPriority

        assert {p.value for p in TaskPriority} == {"low", "medium", "high"}

    def test_task_default_priority_is_medium(self):
        from src.domain.entities.plan import Task, TaskPriority

        t = Task(plan_id=uuid.uuid4(), title="Doc quality policy")
        assert t.priority == TaskPriority.MEDIUM

    def test_task_title_max_200_chars(self):
        from src.domain.entities.plan import Task

        with pytest.raises(ValidationError):
            Task(plan_id=uuid.uuid4(), title="x" * 201)

    def test_task_strips_below_200(self):
        from src.domain.entities.plan import Task

        t = Task(plan_id=uuid.uuid4(), title="a" * 200)
        assert len(t.title) == 200

    def test_task_sort_order_defaults_zero(self):
        from src.domain.entities.plan import Task

        t = Task(plan_id=uuid.uuid4(), title="x")
        assert t.sort_order == 0

    def test_plan_tasks_collection(self):
        from src.domain.entities.plan import Plan, Task

        tasks = [
            Task(plan_id=uuid.uuid4(), title=f"task {i}", sort_order=i)
            for i in range(3)
        ]
        plan = Plan(process_id=uuid.uuid4(), summary_md="resumen", tasks=tasks)
        assert len(plan.tasks) == 3
        assert plan.tasks[0].sort_order == 0
        assert plan.tasks[2].sort_order == 2


class TestCompanyEntity:
    def test_company_has_name_field(self):
        from src.domain.entities.user import Company

        c = Company(
            user_id=uuid.uuid4(),
            business_type="manufactura",
            name="TechCorp S.A.",
        )
        assert c.name == "TechCorp S.A."

    def test_company_is_active_default_true(self):
        from src.domain.entities.user import Company

        c = Company(user_id=uuid.uuid4(), business_type="x", name="X")
        assert c.is_active is True
