import { Field, FieldArray, Form, Formik } from "formik";
import { newKernelQuery } from "libkernel";

function ModuleOverrides() {
  const overrides = {}; //window.postMessage({ method: "getModuleOverrides" }) // TODO: actually call kernel to retrieve overrides
	let [result, errGMO] = await newKernelQuery("getModuleOverrides", {}, false)
	if (errGMO !== null) {
		console.error("can't get overrides", errGMO)
	} else {
		console.log(result)
	}

  const overridesArr = Object.entries(overrides).map(([id, { override, notes }]) => ({
    id,
    override,
    notes
  }));

  return (
    <div className="ModuleOverrides prose">
      <h1>Module overrides</h1>
      <Formik
        initialValues={{
          overrides: overridesArr,
          overrideId: "",
          overrideSkylink: "",
          overrideNote: "",
        }}
        onSubmit={async ({ overrides }, { resetForm }) => {
          const overridesObj = overrides.reduce((agg, { id, override, notes }) => {
            agg[id] = {
              override,
              notes
            };

            return agg;
          }, {});

          console.log('setModuleOverrides', overridesObj)
          let [result, errSMO] = await newKernelQuery("setModuleOverrides", overridesObj, false)
		  if (errSMO !== null) {
			  console.error("can't set overrides", errSMO)
			 } else {
				 console.log(result)
			 }
        }}
      >
        {({ isSubmitting, values, setFieldValue }) => (
          <Form className="flex flex-col gap-4">
            <div>
              <FieldArray
                name="overrides"
                render={({ push, remove }) => {
                  const { overrides = {} } = values;

                  const appendOverride = (override) => {
                    push(override);
                    setFieldValue("overrideId", "");
                    setFieldValue("overrideOverride", "");
                    setFieldValue("overrideNotes", "");
                  };

                  return (
                    <div className="flex flex-col gap-2">
                      {overrides.map((_, index) => (
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
                          className="outline-0 p-2 rounded"
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
    </div>
  );
}

export default ModuleOverrides;
