"""
Add-on modules: product capabilities that only some clients have, kept out of main.py.

An add-on is a package with its own models and routers. Importing this package registers its tables with
SQLModel (so create_all builds them and the tenant filter / RLS cover them); ``register(app)`` mounts its routers.
Each add-on is gated per tenant by feature keys declared in modules/features.py, so mounting it for everyone is
safe: a tenant that does not have the feature gets 403 and no menu entry.

To add one for a new client request: create ``addons/<name>/`` with ``models.py`` and ``routes.py``
(exporting ``routers``), add its feature keys (with path prefixes) to modules/features.py, add it to a preset
in modules/presets.py, and list it below.
"""
from addons.business_suite import models as _business_suite_models  # noqa: F401  (registers the tables)
from addons.business_suite.routes import routers as _business_suite_routers
from addons.institute import models as _institute_models  # noqa: F401  (registers the tables)
from addons.institute.routes import router as _institute_router

ROUTERS = [*_business_suite_routers, _institute_router]


def register(app) -> None:
    for router in ROUTERS:
        app.include_router(router)
