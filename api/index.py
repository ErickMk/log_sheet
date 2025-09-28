from backend.wsgi import application

# Handler for Vercel serverless function
def handler(request, **kwargs):
    return application(request, **kwargs)