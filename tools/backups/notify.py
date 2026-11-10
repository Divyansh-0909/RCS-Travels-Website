"""Send a generic failure message through an explicitly configured route.

No database identifiers, SQL, exception text or credentials in the payload/logs.
The receiver must be configured and tested before enabling real jobs.
"""
import os
import sys

from alert_routes import AlertRefused, configuration, deliver


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if args not in ([], ["--check"]):
        print("ALERT_ARGUMENTS_INVALID")
        return 1
    try:
        config = configuration(os.environ)
        if args == ["--check"]:
            print("ALERT_ROUTE_CONFIGURED_NOT_DELIVERY_VERIFIED")
            return 0
        accepted = deliver(config, os.environ)
    except AlertRefused as error:
        print(str(error))
        return 1
    except Exception:
        print("ALERT_DELIVERY_FAILED")
        return 1
    print(accepted)
    return 0


if __name__ == "__main__":
    sys.exit(main())
