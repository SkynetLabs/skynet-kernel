import { useEffect } from "react";
import { Field, FieldArray, Form, Formik } from "formik";
import { useKernelQuery } from "./hooks/useKernelQuery";

function ModuleOverrides() {
  const {
    error: fetchError,
    response: overrides,
    isPending: isFetching,
    initQuery: fetchOverrides
  } = useKernelQuery("getModuleOverrides", {}, false);
  
  const {
    error: saveError,
    response: saveResponse,
    isPending: isSaving,
    initQuery: saveOverrides
  } = useKernelQuery("setModuleOverrides", {}, false);

  useEffect(() => {
    fetchOverrides();
  }, []); // eslint-disable-line

  return (
    <div className="ModuleOverrides w-[750px]">
      <h1>Module overrides</h1>
      {isFetching && "Loading..."}
      {fetchError}
      {!isFetching && !fetchError && (
        <Formik
          initialValues={{
            overrides: Object.entries(overrides || {}).map(([id, { override, notes }]) => ({
              id,
              override,
              notes
            })),
            overrideId: "",
            overrideOverride: "",
            overrideNotes: "",
          }}
          onSubmit={async ({ overrides }, { resetForm }) => {
            const overridesObj = overrides.reduce((agg, { id, override, notes }) => {
              agg[id] = {
                override,
                notes
              };

              return agg;
            }, {});

            await saveOverrides({ newOverrides: overridesObj });
          }}
        >
          {({ isSubmitting, values, setFieldValue }) => (
            <Form className="flex flex-col gap-4">
              <div>
                <FieldArray
                  name="overrides"
                  render={({ push, remove }) => {
                    const { overrides = [] } = values;

                    const appendOverride = (override) => {
                      push(override);
                      setFieldValue("overrideId", "");
                      setFieldValue("overrideOverride", "");
                      setFieldValue("overrideNotes", "");
                    };

                    return (
                      <div className="w-full flex flex-col gap-2">
                        {overrides && overrides.map((_, index) => (
                          <div key={index} className="flex gap-4 items-center">
                            <Field
                              type="text"
                              name={`overrides.${index}.id`}
                              className="outline-0 p-2 rounded"
                            />
                            <Field
                              type="text"
                              name={`overrides.${index}.override`}
                              className="outline-0 p-2 rounded"
                            />
                            <Field
                              type="text"
                              name={`overrides.${index}.notes`}
                              className="outline-0 p-2 rounded"
                            />
                            <span>
                              <button type="button" onClick={() => remove(index)} className="text-error text-xs">
                                Remove
                              </button>
                            </span>
                          </div>
                        ))}

                        <div className="flex gap-4 items-center">
                          <Field
                            type="text"
                            name="overrideId"
                            placeholder="Module ID"
                            className="focus:outline-0 p-2 rounded"
                          />
                          <Field
                            type="text"
                            name="overrideOverride"
                            placeholder="Module override skylink"
                            className="outline-0 p-2 rounded"
                          />
                          <Field
                            type="text"
                            name="overrideNotes"
                            placeholder="Override notes"
                            className="outline-0 p-2 rounded"
                          />
                          <span>
                            <button
                              type="button"
                              className="text-primary text-xs"
                              onClick={() => appendOverride({
                                id: values.overrideId,
                                override: values.overrideOverride,
                                notes: values.overrideNotes
                              })}
                            >
                              Add
                            </button>
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
              </div>
              {saveError && (
                <div className="w-full rounded px-4 py-3 bg-red-100 border border-red-400">
                  {saveError}
                </div>
              )}
              {!isSaving && saveResponse && saveResponse.success && (
                <div className="w-full rounded px-4 py-3 bg-lime-100 border border-green-400">
                  Changes saved successfully!
                </div>
              )}
              <div className="flex mt-5 justify-center">
                <button
                  type="submit"
                  className={`bg-primary text-white rounded px-6 py-2 ${isSubmitting ? "cursor-wait" : ""}`}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Save"}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      )}
    </div>
  );
}

export default ModuleOverrides;
