"""Unit tests for the SQS plan-generation queue adapter."""

import uuid
from unittest.mock import MagicMock, patch

import pytest

from src.adapters.queue.sqs_adapter import SQSAdapter, get_queue_adapter
from src.errors import QueueEnqueueError


def _make_settings(queue_url=""):
    s = MagicMock()
    s.plan_generation_queue_url = queue_url
    s.aws_cognito_region = "us-east-1"
    return s


@pytest.fixture
def mock_boto_client():
    with patch("src.adapters.queue.sqs_adapter.boto3.client") as client:
        yield client.return_value


@pytest.mark.asyncio
async def test_enqueue_raises_when_queue_url_unset(mock_boto_client):
    adapter = SQSAdapter(_make_settings())

    with pytest.raises(QueueEnqueueError):
        await adapter.enqueue_plan_generation(uuid.uuid4(), uuid.uuid4())

    # No SQS call is attempted without a queue URL.
    mock_boto_client.send_message.assert_not_called()


def test_factory_fails_fast_when_unconfigured():
    """The dependency factory raises BEFORE any DB write, so an unconfigured
    queue can never leave a wedged `queued` job behind."""
    with pytest.raises(QueueEnqueueError):
        get_queue_adapter(_make_settings())


@pytest.mark.asyncio
async def test_enqueue_sends_message_with_ownership(mock_boto_client):
    adapter = SQSAdapter(
        _make_settings("https://sqs.us-east-1.amazonaws.com/123/queue")
    )
    process_id = uuid.uuid4()
    consultant_id = uuid.uuid4()

    await adapter.enqueue_plan_generation(process_id, consultant_id)

    mock_boto_client.send_message.assert_called_once()
    kwargs = mock_boto_client.send_message.call_args.kwargs
    assert kwargs["QueueUrl"] == "https://sqs.us-east-1.amazonaws.com/123/queue"
    body = kwargs["MessageBody"]
    assert str(process_id) in body
    assert str(consultant_id) in body


@pytest.mark.asyncio
async def test_enqueue_wraps_client_error(mock_boto_client):
    adapter = SQSAdapter(
        _make_settings("https://sqs.us-east-1.amazonaws.com/123/queue")
    )
    mock_boto_client.send_message.side_effect = RuntimeError("SQS down")

    with pytest.raises(QueueEnqueueError):
        await adapter.enqueue_plan_generation(uuid.uuid4(), uuid.uuid4())
