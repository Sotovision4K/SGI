---
description: Monitor a Lambda function's recent invocations, errors, and CloudWatch logs.
model: opencode-go/deepseek-v4-pro
---

# Monitor Lambda

Run the following AWS CLI commands to inspect recent activity for a Lambda function.
The project has two functions: `cert-app-dev-api` (FastAPI backend) and `cert-app-dev-post-signup` (Cognito Post-Confirmation trigger).

Use `$ARGUMENTS` as the function name. If empty, default to `cert-app-dev-api`.

## 1. Function overview

```bash
aws lambda get-function --function-name ${1:-cert-app-dev-api} --query 'Configuration.[FunctionName,Runtime,MemorySize,Timeout,LastModified,LastUpdateStatus]' --output table
```

## 2. Recent invocations, errors, throttles, duration (last 1 hour)

```bash
FUNCTION_NAME=${1:-cert-app-dev-api}
START=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
for METRIC in Invocations Errors Throttles Duration; do
  echo "=== $METRIC ==="
  aws cloudwatch get-metric-statistics \
    --namespace AWS/Lambda \
    --metric-name $METRIC \
    --dimensions Name=FunctionName,Value=$FUNCTION_NAME \
    --start-time $START --end-time $END --period 300 \
    --statistics Sum Average \
    --query 'Datapoints' \
    --output table
done
```

## 3. Tail live logs

```bash
aws logs tail /aws/lambda/${1:-cert-app-dev-api} --since 1h --follow
```

## 4. Recent log streams

```bash
aws logs describe-log-streams \
  --log-group-name /aws/lambda/${1:-cert-app-dev-api} \
  --order-by LastEventTime --descending --limit 10 \
  --query 'logStreams[*].[logStreamName,lastEventTimestamp,storedBytes]' \
  --output table
```

## 5. Errors in recent logs (last 1 hour)

```bash
START_MS=$(date -u -d '1 hour ago' +%s000)
aws logs filter-log-events \
  --log-group-name /aws/lambda/${1:-cert-app-dev-api} \
  --start-time $START_MS \
  --filter-pattern '"ERROR" OR "Exception" OR "Traceback"' \
  --limit 50 \
  --query 'events[*].[timestamp,message]' \
  --output text
```
