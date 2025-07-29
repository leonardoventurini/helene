import { EJSON } from '.'

class Address {
  city: string
  state: string

  constructor(city, state) {
    this.city = city
    this.state = state
  }

  typeName() {
    return 'Address'
  }

  toJSONValue() {
    return {
      city: this.city,
      state: this.state,
    }
  }

  equals(other: any) {
    return (
      other instanceof Address &&
      this.city === other.city &&
      this.state === other.state
    )
  }
}

class Person {
  name: string
  birthDate: Date
  address: Address

  constructor(name, birthDate, address) {
    this.name = name
    this.birthDate = birthDate
    this.address = address
  }

  typeName() {
    return 'Person'
  }

  toJSONValue() {
    return {
      name: this.name,
      birthDate: EJSON.toJSONValue(this.birthDate),
      address: EJSON.toJSONValue(this.address),
    }
  }

  equals(other: any) {
    return (
      other instanceof Person &&
      this.name === other.name &&
      EJSON.equals(this.birthDate, other.birthDate) &&
      EJSON.equals(this.address, other.address)
    )
  }
}

class Holder {
  value: any

  constructor(value) {
    this.value = value
  }

  typeName() {
    return 'Holder'
  }

  toJSONValue() {
    return this.value
  }

  equals(other: any) {
    return other instanceof Holder && EJSON.equals(this.value, other.value)
  }
}

const addTypes = () => {
  EJSON.addType(
    'Person',
    value =>
      new Person(
        value.name,
        EJSON.fromJSONValue(value.birthDate),
        EJSON.fromJSONValue(value.address),
      ),
  )
  EJSON.addType('Address', value => new Address(value.city, value.state))
  EJSON.addType('Holder', value => new Holder(value))
}

export const CustomModels = {
  Address,
  Person,
  Holder,

  addTypes,
}
