# kernel-test-mysky

kernel-test-mysky is a test module that receives the mysky seed. Because the
mysky seed holds read-write access to a considerable amount of sensitive user
data, we wanted to put the tests surrounding the myksy seed in its own module.
The kernel only gives the seed to the immutable version of this module.

By only giving the seed to the immutable version of the module, and by making
sure the total amount of code involved in this test is as tiny as possible, we
minimize the risk that the testing module could be used to expose the user's
mysky root seed.
