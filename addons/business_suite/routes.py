from addons.business_suite import ai_reports, client_tools, command_center, extras, follow_up_board, lead_tools, scm2

routers = [scm2.router, command_center.router, ai_reports.router, extras.router, follow_up_board.router,
           lead_tools.router, client_tools.router]
