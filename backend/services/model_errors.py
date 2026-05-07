class ModelServiceError(Exception):
    pass


class ModelNotFoundError(ModelServiceError):
    pass


class ModelValidationError(ModelServiceError):
    pass


class ModelDependencyUnavailableError(ModelServiceError):
    pass


class ModelInferenceUnavailableError(ModelServiceError):
    pass
