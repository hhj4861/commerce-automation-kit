"""Estimate Neon compute hours for the litellm database from request times (stdlib only).

Neon suspends a compute `idle` seconds after its last query. LiteLLM queries the database
on a request (key lookup, spend write) and once more when an instance scales down (the
shutdown flush). A session ends `shutdown_after` seconds after its last request. With a
warm ping or a minimum instance, the instance never scales down, but background jobs may
query every `periodic` seconds (measured in Phase 2 g2).

Input: one epoch-seconds value per line on stdin. Output: one JSON object.
"""
import argparse
import json
import math
import sys

NEON_LAUNCH_USD_PER_CU_HOUR = 0.106
CLOUD_SQL_F1_MICRO_USD = 9.4


def db_touches(requests, shutdown_after=None, periodic=None, window=None):
    ordered = sorted(requests)
    touches = list(ordered)
    if shutdown_after is not None:
        touches += [a + shutdown_after for a, b in zip(ordered, ordered[1:] + [math.inf]) if b - a > shutdown_after]
    if periodic:
        start, end = window
        touches += [start + i * periodic for i in range(int((end - start) // periodic) + 1)]
    return sorted(touches)


def active_seconds(touches, idle=300):
    total, end = 0.0, -math.inf
    for touch in sorted(touches):
        stop = touch + idle
        if stop > end:
            total += stop - max(touch, end)
            end = stop
    return total


def monthly_cost(active_seconds_per_day, cu=0.25, price=NEON_LAUNCH_USD_PER_CU_HOUR, days=30.4):
    hours = active_seconds_per_day / 3600 * days
    usd = round(hours * cu * price, 2)
    return {"active_hours_per_day": round(active_seconds_per_day / 3600, 2),
            "cu_hours_per_month": round(hours * cu, 1), "usd_per_month": usd,
            "cloud_sql_cheaper": usd > CLOUD_SQL_F1_MICRO_USD}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=float, required=True, help="length of the window the input covers")
    parser.add_argument("--idle", type=float, default=300, help="Neon suspend delay in seconds")
    parser.add_argument("--shutdown-after", type=float, help="seconds from a session's last request to its shutdown flush")
    parser.add_argument("--periodic", type=float, help="seconds between background queries of a warm instance")
    args = parser.parse_args(argv)
    stamps = [float(line) for line in sys.stdin if line.strip()]
    if not stamps:
        parser.error("no request times on stdin")
    end = max(stamps)
    touches = db_touches(stamps, args.shutdown_after, args.periodic, (end - args.days * 86400, end))
    per_day = active_seconds(touches, args.idle) / args.days
    print(json.dumps({"requests": len(stamps), "days": args.days, "shutdown_after": args.shutdown_after,
                      "periodic": args.periodic, **monthly_cost(per_day)}))


if __name__ == "__main__":
    main()
