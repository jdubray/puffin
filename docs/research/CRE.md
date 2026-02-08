/@puffin: let's create the specification of the central reasoning engine, the specification will be followed by a design activity and a separate design document. Focus exclusively on the specification:
- assumptions
- roles and responsibilities
- requirements


The current process calls for the user to: 
- prompt or submit a spec to request changes into a project
- Claude/Puffin create user stories
- The user assembles user stories into a sprint
- Claude/Puffin create a plan which can be iterated upon, questions can be asked
- Once ready the plan is approved
- Puffin orchestrates the implementation of the user stories in an order determined by the plan
- The implementation completes with a code review and a bug fixing session.

For Puffin V3, we already added a memory plugin and an outcome lifecycle plugin

The goal this specification is to specify the role and responsibilities of a new component, the CRE (central reasoning engine)

The role of the CRE will span from planning to creating "ready to implement specifications". RIS (ready to implement specifiations) are derived from a given user stories, the plan and the knowledge of the code base.

CRE Deliverables:
- Implementation plan for the sprint as currently managed (initiate plan, ask clarifying questions, plan is approved, inspection assertions are generated)
- Ready to implement specifications (RIS). This is new, before implementation tasks start for a given user stories, the CRE computes one or more RIS, at a minimum one per branch. RIS give detailed instructions (as it is often the case in the current planning phase) for CLaude to carry out the user story implementations

Plans and RIS need to be stored in the database and related to the sprint and user stories they are the source from. RIS are connected to the plan as well
Sprint 1:1 -> Plan
Sprint 1:* -> user story
User Story 1:* -> RIS
By transitivity:
RIS *:1 -> Plan
RIS *:1 -> Sprint

RIS are typically short and to the point, they should lead to a deterministic implementation

Now, the underlying substracte of the CRE is a hybrid Domain Specific Language (See document enclosed) that constitutes a Code Model of the entire solution and that is maintained by the CRE as a feedback loop from the RIS implementation activities. Once the code has been implemented (after the bug fixing session) the CRE instrospect the code changes and additions and 

A hybrid DSL (h-DSL) is a combination of traditional structured DSL and prose. Limit the DSL structure to a mininum to describe well known-software artifacts and prefer prose to describe details about the code that would require a complex DSL to express. We want the best of both world.

The DSL is created and augmented on the fly by the CRE when a new concept needs to be added to the DSL schema.

The DSL (schema) should be stored in a JSON file as should be the h-DSL instance that describes the code. The structure of the h-DSL is to intricate to store in a database scheme, it's preferable not to be constrained by the semantics of SQL.

The DSL schema should be annotated with h-M3, as a DSL element can only roll up to one-of the h-M3 structure.

The "outcome lifecycle" should have been part of the DSL but because its relative importance and the fact that it is sometimes easier to edit it manually, this is managed by the Outcome Lifecycle Plugin. 

The CRE is core to Puffin and should not be designed as a plugin. 

Start by writing the first pass, do not ask any questions, we will iterate from there.
@/